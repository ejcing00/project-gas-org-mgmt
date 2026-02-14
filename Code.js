/**Code.gs*/

/* 공통 include 유틸 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

var DB_SPREADSHEET_ID = '11iT1zbRA60P8N9ip3Lki-EZSg30HiACJcj9NoVrehsY';

/*접속유저찾기: User*/
var USER_SHEET_NAME   = 'User';

function getActorEmail_() {
  var a = Session.getActiveUser().getEmail();
  if (a) return a;
  var e = Session.getEffectiveUser().getEmail();
  return e || '';
}

function _toBool_(v){
  return (v === true) || (typeof v === 'string' && v.trim().toUpperCase() === 'TRUE');
}

function _headerIndex_(header, name){
  name = String(name||'').trim().toLowerCase();
  for (var i=0; i<header.length; i++){
    if (String(header[i]||'').trim().toLowerCase() === name) return i;
  }
  return -1;
}

function USER_getCurrentUser_() {
  var email = getActorEmail_();
  if (!email) return null;

  var ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  var sh = ss.getSheetByName(USER_SHEET_NAME || 'User');
  if (!sh) throw new Error('User 시트를 찾을 수 없습니다.');

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return null;

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var header = values[0];

  var colEmail   = _headerIndex_(header, 'email');
  var colRole    = _headerIndex_(header, 'role');
  var colActive  = _headerIndex_(header, 'active');
  var colEmpId   = _headerIndex_(header, 'emp_id');
  var colEmpName = _headerIndex_(header, 'emp_name');

  if (colEmail === -1 || colRole === -1 || colActive === -1 || colEmpId === -1 || colEmpName === -1) {
    throw new Error('User 시트 헤더(email, role, active, emp_id, emp_name)를 찾을 수 없습니다.');
  }

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowEmail = String(row[colEmail] || '').trim();
    if (!rowEmail) continue;

    if (rowEmail.toLowerCase() !== email.toLowerCase()) continue;
    if (!_toBool_(row[colActive])) continue;

    return {
      email: rowEmail,
      role: String(row[colRole] || '').trim(),
      emp_id: String(row[colEmpId] || '').trim(),
      emp_name: String(row[colEmpName] || '').trim()
    };
  }
  return null;
}

function _normRoleKey_(role){
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')     // 공백 제거
    .replace(/[^\w]/g, '');  // 영숫자/_ 외 제거
}

/*접속유저 Role/Permission*/
function ACL_getPermMapForRole_(role) {
  // ✅ role 값 공백/대소문자 정리 (super admin -> superadmin)
  role = String(role || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!role) return {};

  var ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  var sh = ss.getSheetByName('Permission');
  if (!sh) throw new Error('Permission 시트를 찾을 수 없습니다.');

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return {};

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var header = values[0];

  var cKey    = _headerIndex_(header, 'permission_key');
  var cType   = _headerIndex_(header, 'permission_type');
  var cUiDeny = _headerIndex_(header, 'ui_deny');
  var cActive = _headerIndex_(header, 'active');

  if (cKey === -1 || cType === -1 || cUiDeny === -1 || cActive === -1) {
    throw new Error('Permission 헤더(permission_key, permission_type, ui_deny, active)를 찾을 수 없습니다.');
  }

  var roleColName = 'role_' + _normRoleKey_(role);
  var cRole = _headerIndex_(header, roleColName);
  if (cRole === -1) throw new Error('Permission 시트에 역할 컬럼이 없습니다: ' + roleColName);

  var map = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var key = String(row[cKey] || '').trim();
    if (!key) continue;

    var rowActive = _toBool_(row[cActive]);    // row 자체 사용여부
    var roleAllow = _toBool_(row[cRole]);      // 역할별 allow

    map[key] = {
      // ✅ active가 FALSE면 무조건 deny (하지만 ui_deny/type은 유지!)
      allow: rowActive && roleAllow,
      type: String(row[cType] || '').trim(),
      ui_deny: String(row[cUiDeny] || '').trim() || 'hide',
      active: rowActive
    };
  }
  return map;
}

// ✅ 공용 ACL (사이드바 + 버튼 공통)
function UI_getAcl() {
  var user = USER_getCurrentUser_();
  if (!user) {
    return { ok:false, message:'User 시트에 현재 계정 정보가 없거나 active가 TRUE가 아닙니다.' };
  }

  var permMap = ACL_getPermMapForRole_(user.role);

  // page 권한만 뽑아서 sidebar에 쓰기 좋은 형태로
  var allowPages = {};
  Object.keys(permMap).forEach(function(k){
    var p = permMap[k];
    if (p.type !== 'page') return;
    var m = k.match(/^page:([^:]+):view$/);
    if (!m) return;
    allowPages[m[1]] = !!p.allow;
  });

  return {
    ok: true,
    user: { email:user.email, emp_id:user.emp_id, emp_name:user.emp_name, role:user.role },
    allowPages: allowPages,
    permMap: permMap
  };
}

// ✅ 기존 호출 유지용(호환)
function UI_getSidebarAcl() {
  return UI_getAcl();
}

/** 사이드바 유저카드용 API */
function UI_getSidebarUserCard() {
  var user = USER_getCurrentUser_();  // 이미 만든 함수 재사용

  if (!user) {
    return {
      ok: false,
      message: 'User 시트에 현재 계정 정보가 없거나 active가 TRUE가 아닙니다.'
    };
  }

  return {
    ok: true,
    user: user   // { email, emp_id, emp_name }
  };
}


/** 웹앱 엔트리 */
function doGet(e) {
  var user = USER_getCurrentUser_();

  // 🔒 User 시트에 없으면 접속 불가 처리
  if (!user) {
    var tDenied = HtmlService.createTemplateFromFile('noAccess'); // 새 HTML
    return tDenied.evaluate()
      .setTitle('접근 권한 없음')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // ✅ 정상 사용자면 index 로
  var t = HtmlService.createTemplateFromFile('index');
  // t.user = user;  // 필요하면 템플릿에 내려보내도 됨

  return t.evaluate()
    .setTitle('통합 관리 시스템')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


