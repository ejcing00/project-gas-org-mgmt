/** accessControlService.gs */
function AC_assertAccess_(){
  var me = USER_getCurrentUser_();
  if (!me) throw new Error('로그인 사용자 없음');

  var permMap = ACL_getPermMapForRole_(me.role);
  var p = permMap['page:accesscontrol:view'];
  if (!p || !p.allow) throw new Error('접근제어 권한 없음');

  return me;
}

function _acSheet_(name){
  var ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error(name + ' 시트를 찾을 수 없습니다.');
  return sh;
}

function _acReadTable_(sh){
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return { header:[], rows:[] };
  if (lastRow < 2) return { header: sh.getRange(1,1,1,lastCol).getValues()[0], rows: [] };

  var values = sh.getRange(1,1,lastRow,lastCol).getValues();
  return { header: values[0], rows: values.slice(1) };
}

function _acGetCol_(header, name){
  return _headerIndex_(header, name); // Code.gs의 _headerIndex_ 재사용
}

function _acRowToObj_(header, row){
  var o = {};
  for (var i=0; i<header.length; i++){
    var k = String(header[i]||'').trim();
    if (!k) continue;
    o[k] = row[i];
  }
  return o;
}

function _acNormalizeBool_(v){
  return _toBool_(v); // Code.gs의 _toBool_ 재사용
}

function AC_getInit(){
  try{
    var me = AC_assertAccess_();

    var tRole = _acReadTable_(_acSheet_('Role'));
    var tPerm = _acReadTable_(_acSheet_('Permission'));
    var tUser = _acReadTable_(_acSheet_('User'));

    // 객체 배열로 변환
    var roles = tRole.rows.map(function(r){ return _acRowToObj_(tRole.header, r); });
    var perms = tPerm.rows.map(function(r){ return _acRowToObj_(tPerm.header, r); });
    var users = tUser.rows.map(function(r){ return _acRowToObj_(tUser.header, r); });

    return {
      ok:true,
      me: me,
      roles: roles,
      permissions: perms,
      users: users
    };
  } catch(err){
    return { ok:false, message: err.message };
  }
}

/**
 * payload = {
 *   roles: [{role_id, active}],
 *   permissions: [{permission_id, active}],
 *   users: [{email, emp_id, emp_name, role, active, origin_email?}],
 *   deleteEmails: [ ... ]
 * }
 */
function AC_save(payload){
  try{
    var me = AC_assertAccess_();
    payload = payload || {};

    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      if (Array.isArray(payload.roles)) _acSaveRoles_(payload.roles);
      if (Array.isArray(payload.permissions)) _acSavePermissions_(payload.permissions);

      var del = Array.isArray(payload.deleteEmails) ? payload.deleteEmails : [];
      var users = Array.isArray(payload.users) ? payload.users : [];
      _acSaveUsers_(users, del);

    } finally {
      lock.releaseLock();
    }

    return { ok:true };
  } catch(err){
    return { ok:false, message: err.message };
  }
}

function _acSaveRoles_(rows){
  var sh = _acSheet_('Role');
  var t = _acReadTable_(sh);
  var h = t.header;

  var cId = _acGetCol_(h,'role_id');
  var cActive = _acGetCol_(h,'active');
  if (cId < 0 || cActive < 0) throw new Error('Role 시트 헤더(role_id, active)가 필요합니다.');

  // role_id -> rowIndex(2-based)
  var map = {};
  for (var i=0; i<t.rows.length; i++){
    var id = String(t.rows[i][cId]||'').trim();
    if (id) map[id] = i+2;
  }

  rows.forEach(function(p){
    var id = String(p.role_id||'').trim();
    if (!id) return;
    var rowIndex = map[id];
    if (!rowIndex) return;
    sh.getRange(rowIndex, cActive+1).setValue(!!p.active);
  });
}

function _acSavePermissions_(rows){
  var sh = _acSheet_('Permission');
  var t = _acReadTable_(sh);
  var h = t.header;

  var cId = _acGetCol_(h,'permission_id');
  var cActive = _acGetCol_(h,'active');
  if (cId < 0 || cActive < 0) throw new Error('Permission 시트 헤더(permission_id, active)가 필요합니다.');

  // permission_id -> rowIndex(2-based)
  var map = {};
  for (var i=0; i<t.rows.length; i++){
    var id = String(t.rows[i][cId]||'').trim();
    if (id) map[id] = i+2;
  }

  rows.forEach(function(p){
    var id = String(p.permission_id||'').trim();
    if (!id) return;

    var rowIndex = map[id];
    if (!rowIndex) return;

    // ✅ active 업데이트
    sh.getRange(rowIndex, cActive+1).setValue(!!p.active);

    // ✅ role_* 업데이트 (payload에 들어온 것만)
    Object.keys(p).forEach(function(k){
      if (k.indexOf('role_') !== 0) return; // role_로 시작하는 키만
      var col = _acGetCol_(h, k);
      if (col < 0) return;                 // 시트에 없는 role 컬럼이면 무시
      sh.getRange(rowIndex, col+1).setValue(!!p[k]);
    });
  });
}


function _acSaveUsers_(users, deleteEmails){
  var sh = _acSheet_('User');
  var t = _acReadTable_(sh);
  var h = t.header;

  var cEmail = _acGetCol_(h,'email');
  var cEmpId = _acGetCol_(h,'emp_id');
  var cEmpNm = _acGetCol_(h,'emp_name');
  var cRole  = _acGetCol_(h,'role');
  var cActive= _acGetCol_(h,'active');

  if (cEmail<0 || cRole<0 || cActive<0) throw new Error('User 시트 헤더(email, role, active)가 필요합니다.');

  if (cEmpId >= 0){
    var maxRows = sh.getMaxRows();
    if (maxRows > 1){
      sh.getRange(2, cEmpId+1, maxRows-1, 1).setNumberFormat('@');
    }
  }

  // email -> rowIndex
  function buildMap_(){
    var m = {};
    var rows = sh.getLastRow();
    var cols = sh.getLastColumn();
    if (rows < 2) return m;
    var vals = sh.getRange(1,1,rows,cols).getValues();
    var hh = vals[0];
    var ce = _acGetCol_(hh,'email');
    for (var i=1;i<vals.length;i++){
      var em = String(vals[i][ce]||'').trim().toLowerCase();
      if (em) m[em] = i+1;
    }
    return m;
  }

  // 1) 삭제(내려온 목록) 먼저 처리 (인덱스 꼬임 방지: 내림차순)
  var map = buildMap_();
  var delRows = [];
  (deleteEmails || []).forEach(function(em){
    em = String(em||'').trim().toLowerCase();
    if (!em) return;
    if (map[em]) delRows.push(map[em]);
  });
  delRows.sort(function(a,b){ return b-a; });
  delRows.forEach(function(r){ sh.deleteRow(r); });

  // 2) upsert
  map = buildMap_(); // 삭제 후 재구성
  users.forEach(function(u){
    var email = String(u.email||'').trim();
    if (!email) return;

    var key = email.toLowerCase();
    var rowIndex = map[key] || 0;

    var cols = sh.getLastColumn();
    var row = null;

    if (rowIndex){
      row = sh.getRange(rowIndex,1,1,cols).getValues()[0];
    } else {
      row = new Array(cols).fill('');
      row[cEmail] = email;
    }

    if (cEmpId>=0){
      var v = String(u.emp_id ?? '').trim();
      row[cEmpId] = v ? ("'" + v) : '';
    }
    if (cEmpNm>=0) row[cEmpNm] = String(u.emp_name||'').trim();
    row[cRole] = String(u.role||'').trim();
    row[cActive] = !!u.active;

    if (rowIndex){
      sh.getRange(rowIndex,1,1,cols).setValues([row]);
    } else {
      sh.appendRow(row);
      map[key] = sh.getLastRow();
    }
  });
}