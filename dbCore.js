function DB_ss_(){
  return SpreadsheetApp.openById(DB_SPREADSHEET_ID);
}

function DB_sheet_(name){
  var sh = DB_ss_().getSheetByName(name);
  if (!sh) throw new Error('시트를 찾을 수 없습니다: ' + name);
  return sh;
}

function DB_header_(sh){
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1,1,1,lastCol).getValues()[0] || [];
}

function DB_headerMap_(header){
  var map = {};
  for (var i=0; i<header.length; i++){
    var k = String(header[i]||'').trim();
    if (!k) continue;
    map[k] = i; // 0-based index
  }
  return map;
}

function DB_normEmpId_(v){
  // User 시트에서 앞에 ' 를 붙였을 가능성 대비
  return String(v || '').trim().replace(/^'+/, '');
}

function DB_normEmpName_(v){
  // 앞에 ' 붙어있거나 공백이 많아진 경우 정리
  return String(v || '').trim().replace(/^'+/, '').replace(/\s+/g, ' ');
}

/** created_by/updated_by 저장용: "emp_id emp_name" */
function DB_actorLabel_(actor){
  actor = actor || {};
  var id = DB_normEmpId_(actor.emp_id);
  var name = DB_normEmpName_(actor.emp_name);

  if (id && name) return id + ' ' + name;
  return id || name || '';
}

function DB_getActor_(){
  var me = USER_getCurrentUser_();
  if (!me) throw new Error('로그인 사용자 없음(User 시트 확인 필요)');
  me.emp_id = DB_normEmpId_(me.emp_id);
  me.emp_name = DB_normEmpName_(me.emp_name);  
  return me;
}

function DB_assertPerm_(permKey){
  var me = DB_getActor_();

  // 개발 편의: admin/superadmin은 기본 통과
  var roleKey = String(me.role || '').trim().toLowerCase().replace(/\s+/g,'');
  if (roleKey === 'admin' || roleKey === 'superadmin') return me;

  // Permission 시트 기반 체크
  var permMap = ACL_getPermMapForRole_(me.role);
  var p = permMap[permKey];
  if (!p || !p.allow) throw new Error('권한 없음: ' + permKey);

  return me;
}

function DB_readColumnValues_(sh, colIndex1Based){
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  return sh.getRange(2, colIndex1Based, lastRow-1, 1).getValues().map(function(r){ return r[0]; });
}

function DB_nextIntId_(sheetName, idField){
  var sh = DB_sheet_(sheetName);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  if (!(idField in map)) throw new Error('ID 필드를 찾을 수 없습니다: ' + idField + ' in ' + sheetName);

  var col = map[idField] + 1; // 1-based
  var vals = DB_readColumnValues_(sh, col);

  var max = 0;
  vals.forEach(function(v){
    var n = parseInt(String(v||'').replace(/[^\d]/g,''), 10);
    if (!isNaN(n) && n > max) max = n;
  });

  // 중복 방지용: 혹시라도 값이 비정상/중복이면 while로 비어있는 번호 찾기
  var used = {};
  vals.forEach(function(v){
    var n = parseInt(String(v||'').replace(/[^\d]/g,''), 10);
    if (!isNaN(n)) used[n] = true;
  });

  var next = max + 1;
  while (used[next]) next++;

  return next;
}

function DB_objToRow_(header, obj){
  var row = new Array(header.length).fill('');
  for (var i=0; i<header.length; i++){
    var k = String(header[i]||'').trim();
    if (!k) continue;
    if (obj.hasOwnProperty(k)) row[i] = obj[k];
  }
  return row;
}

/**
 * 공용 Insert (Lock 포함)
 * - autoFields: created_at/created_by/updated_at/updated_by 자동 채움(존재할 때만)
 */
function DB_insert_(sheetName, obj, opts){
  opts = opts || {};
  var idField = opts.idField || 'id';
  var actor   = opts.actor || DB_getActor_();
  var autoFields = (opts.autoFields !== false);

  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try{
    var sh = DB_sheet_(sheetName);
    var header = DB_header_(sh);
    var map = DB_headerMap_(header);

    // nextId 생성
    var newId = DB_nextIntId_(sheetName, idField);
    obj[idField] = newId;

    // 감사필드 자동
    if (autoFields) {
      var now = new Date();
      if (map['created_at'] != null && !obj.created_at) obj.created_at = now;
      if (map['updated_at'] != null) obj.updated_at = now;

      // created_by/updated_by는 emp_id로 기록
      if (map['created_by'] != null) obj.created_by = DB_actorLabel_(actor);
      if (map['updated_by'] != null) obj.updated_by = DB_actorLabel_(actor);
    }

    // 1) 혹시라도 같은 ID가 존재하면 방지(최후 안전장치)
    var idCol = map[idField] + 1;
    var vals = DB_readColumnValues_(sh, idCol);
    for (var i=0; i<vals.length; i++){
      if (String(vals[i]||'').trim() === String(newId)) {
        throw new Error('중복 ID 감지: ' + newId + ' (동시 저장 또는 데이터 이상)');
      }
    }

    // append
    var row = DB_objToRow_(header, obj);
    sh.appendRow(row);

    return { ok:true, id:newId };

  } finally {
    lock.releaseLock();
  }
}

/**
 * ID로 rowIndex 찾기 (Unlocked)
 * - 반환: 0(없음) 또는 2~
 */
function DB_findRowIndexByIdUnlocked_(sh, idField, idValue){
  idValue = String(idValue || '').trim();
  if (!idValue) return 0;

  var header = DB_header_(sh);
  var map = DB_headerMap_(header);
  if (map[idField] == null) throw new Error('ID 필드를 찾을 수 없습니다: ' + idField);

  var col = map[idField] + 1; // 1-based
  var last = sh.getLastRow();
  if (last < 2) return 0;

  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === idValue) return i + 2;
  }
  return 0;
}

/**
 * ID로 단건 조회
 */
function DB_getById_(sheetName, idField, idValue){
  var sh = DB_sheet_(sheetName);
  var rowIndex = DB_findRowIndexByIdUnlocked_(sh, idField, idValue);
  if (!rowIndex) return null;

  var header = DB_header_(sh);
  var row = sh.getRange(rowIndex, 1, 1, header.length).getValues()[0];
  var obj = {};
  for (var i = 0; i < header.length; i++) {
    var k = String(header[i] || '').trim();
    if (!k) continue;
    obj[k] = row[i];
  }
  return obj;
}

/**
 * 단순 where 조회 (field == value)
 */
function DB_queryByField_(sheetName, field, value){
  var sh = DB_sheet_(sheetName);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);
  if (map[field] == null) throw new Error(sheetName + ' 시트에 컬럼이 없습니다: ' + field);

  var last = sh.getLastRow();
  if (last < 2) return [];

  var vals = sh.getRange(2, 1, last - 1, header.length).getValues();
  var idx = map[field];
  var mv = String(value || '').trim();

  var out = [];
  for (var r = 0; r < vals.length; r++) {
    if (String(vals[r][idx] || '').trim() !== mv) continue;
    var obj = {};
    for (var c = 0; c < header.length; c++) {
      var k = String(header[c] || '').trim();
      if (!k) continue;
      obj[k] = vals[r][c];
    }
    out.push(obj);
  }
  return out;
}

/**
 * 공용 Update (Lock 포함)
 * - obj에 포함된 키만 업데이트(헤더에 존재하는 키만)
 * - updated_at/updated_by 자동
 */
function DB_updateById_(sheetName, idField, idValue, obj, opts){
  opts = opts || {};
  var actor = opts.actor || DB_getActor_();
  var autoFields = (opts.autoFields !== false);

  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try{
    return DB_updateByIdUnlocked_(sheetName, idField, idValue, obj, {
      actor: actor,
      autoFields: autoFields
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 공용 Update (Unlocked)
 * - Bundle 저장 등에서 외부 lock을 이미 잡았을 때 사용
 */
function DB_updateByIdUnlocked_(sheetName, idField, idValue, obj, opts){
  opts = opts || {};
  var actor = opts.actor || DB_getActor_();
  var autoFields = (opts.autoFields !== false);

  var sh = DB_sheet_(sheetName);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  if (map[idField] == null) throw new Error('ID 필드를 찾을 수 없습니다: ' + idField + ' in ' + sheetName);

  var rowIndex = DB_findRowIndexByIdUnlocked_(sh, idField, idValue);
  if (!rowIndex) return { ok:false, message: sheetName + '에서 ' + idField + '=' + idValue + ' 행을 찾을 수 없습니다.' };

  var row = sh.getRange(rowIndex, 1, 1, header.length).getValues()[0];
  obj = obj || {};

  Object.keys(obj).forEach(function(k){
    if (map[k] == null) return;
    row[map[k]] = obj[k];
  });

  if (autoFields) {
    var now = new Date();
    if (map['updated_at'] != null) row[map['updated_at']] = now;
    if (map['updated_by'] != null) row[map['updated_by']] = DB_actorLabel_(actor);
  }

  sh.getRange(rowIndex, 1, 1, header.length).setValues([row]);
  return { ok:true, id: String(idValue || '').trim() };
}