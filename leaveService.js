/**
 * leaveService.gs
 * - 연차설정(적용연도/직원명단) 1단계: 직원명단 조회
 * - Employee 시트에서 category(고용구분) 있는 직원만 반환
 * - 총근무연수(년/월/일, 월합계) + 총근무연차(년차) 계산 포함
 */

function LEAVE_ss_(){
  try{
    if (typeof DB_ss_ === 'function') return DB_ss_();
  }catch(e){}
  try{
    if (typeof DB_SPREADSHEET_ID !== 'undefined' && DB_SPREADSHEET_ID){
      return SpreadsheetApp.openById(DB_SPREADSHEET_ID);
    }
  }catch(e){}
  return SpreadsheetApp.getActiveSpreadsheet();
}

function LEAVE_assertPerm_(permKey){
  if (typeof DB_assertPerm_ === 'function') return DB_assertPerm_(permKey);
  return null;
}

function LEAVE_sheetValues_(ss, sheetName){
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { header:[], rows:[] };
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return { header:[], rows:[] };
  var values = sh.getRange(1, 1, lr, lc).getValues();
  var header = (values[0] || []).map(function(v){ return String(v || '').trim(); });
  return { header: header, rows: values.slice(1) };
}

function LEAVE_sheetMatrixBySheet_(sh){
  if (!sh) return [];
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return [];
  return sh.getRange(1, 1, lr, lc).getValues();
}

function LEAVE_boolTrue_(v){
  if (v === true || v === 1) return true;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return (s === '1' || s === 'true' || s === 'y' || s === 'yes' || s === 'on' || s === '활성');
}

function LEAVE_findCol_(header, name){
  if (!header || !header.length) return -1;
  if (typeof _headerIndex_ === 'function') return _headerIndex_(header, name);
  name = String(name || '').trim().toLowerCase();
  for (var i=0; i<header.length; i++){
    if (String(header[i] || '').trim().toLowerCase() === name) return i;
  }
  return -1;
}

function LEAVE_normRoleKey_(role){
  role = String(role || '').trim().toLowerCase();
  role = role.replace(/\s+/g, '');
  role = role.replace(/[^\w]/g, '');
  return role;
}

function LEAVE_getApprovalRecipientEmails_(){
  try{
    var ss = LEAVE_ss_();
    var userT = LEAVE_sheetValues_(ss, 'User');
    var permT = LEAVE_sheetValues_(ss, 'Permission');
    var uh = userT.header || [];
    var ph = permT.header || [];
    var ur = userT.rows || [];
    var pr = permT.rows || [];
    if (!uh.length || !ph.length || !ur.length || !pr.length) return [];

    var cUEmail = LEAVE_findCol_(uh, 'email');
    var cURole = LEAVE_findCol_(uh, 'role');
    var cUActive = LEAVE_findCol_(uh, 'active');
    var cPKey = LEAVE_findCol_(ph, 'permission_key');
    var cPActive = LEAVE_findCol_(ph, 'active');
    if (cUEmail < 0 || cURole < 0 || cUActive < 0 || cPKey < 0 || cPActive < 0) return [];

    var permRow = null;
    for (var i=0; i<pr.length; i++){
      var key = String(pr[i][cPKey] || '').trim();
      if (key === 'btn:leave:approval'){
        permRow = pr[i];
        break;
      }
    }
    if (!permRow) return [];
    if (!LEAVE_boolTrue_(permRow[cPActive])) return [];

    var emails = [];
    var seen = {};
    for (var r=0; r<ur.length; r++){
      var row = ur[r] || [];
      if (!LEAVE_boolTrue_(row[cUActive])) continue;

      var email = String(row[cUEmail] || '').trim().toLowerCase();
      if (!email) continue;
      var role = String(row[cURole] || '').trim();
      if (!role) continue;

      var roleColName = 'role_' + LEAVE_normRoleKey_(role);
      var roleCol = LEAVE_findCol_(ph, roleColName);
      if (roleCol < 0) continue;
      if (!LEAVE_boolTrue_(permRow[roleCol])) continue;

      if (seen[email]) continue;
      seen[email] = true;
      emails.push(email);
    }
    return emails;
  }catch(e){
    return [];
  }
}

function LEAVE_lookupEmployeeName_(employeeId){
  employeeId = String(employeeId || '').trim();
  if (!employeeId) return '';

  try{
    if (typeof DB_queryByField_ === 'function'){
      var rows = DB_queryByField_('Employee', 'employee_id', employeeId) || [];
      for (var i=0; i<rows.length; i++){
        var r = rows[i] || {};
        if (LEAVE_boolTrue_(r.is_deleted)) continue;
        if (LEAVE_boolTrue_(r.is_visible)) continue;
        var nm = String(r.name || '').trim();
        if (nm) return nm;
      }
    }
  }catch(e){}

  try{
    var ss = LEAVE_ss_();
    var t = LEAVE_sheetValues_(ss, 'Employee');
    var h = t.header || [];
    var rows2 = t.rows || [];
    var cId = LEAVE_findCol_(h, 'employee_id');
    var cNm = LEAVE_findCol_(h, 'name');
    var cDel = LEAVE_findCol_(h, 'is_deleted');
    var cVis = LEAVE_findCol_(h, 'is_visible');
    if (cId < 0 || cNm < 0) return '';
    for (var j=0; j<rows2.length; j++){
      var rr = rows2[j] || [];
      if (String(rr[cId] || '').trim() !== employeeId) continue;
      if (cDel >= 0 && LEAVE_boolTrue_(rr[cDel])) continue;
      if (cVis >= 0 && LEAVE_boolTrue_(rr[cVis])) continue;
      return String(rr[cNm] || '').trim();
    }
  }catch(e2){}
  return '';
}

function LEAVE_sendApplyNoticeMail_(ctx){
  ctx = ctx || {};

  var recipients = LEAVE_getApprovalRecipientEmails_();
  if (!recipients.length) return { ok:false, skipped:true, reason:'no_recipient' };

  var employeeId = String(ctx.employee_id || '').trim();
  var employeeName = String(ctx.employee_name || '').trim() || LEAVE_lookupEmployeeName_(employeeId);
  var category = String(ctx.category || '').trim();
  var date = String(ctx.date || '').trim();
  var startTime = String(ctx.start_time || '').trim();
  var endTime = String(ctx.end_time || '').trim();
  var days = String(ctx.days || '').trim();
  var actor = String(ctx.created_by || '').trim();
  var createdAt = ctx.created_at instanceof Date ? ctx.created_at : new Date();

  var tz = 'Asia/Seoul';
  try{ tz = Session.getScriptTimeZone() || tz; }catch(e){}
  var createdAtText = Utilities.formatDate(createdAt, tz, 'yyyy-MM-dd HH:mm:ss');

  var who = LEAVE_composeApplicantText_(employeeId, employeeName);
  var subject = '[통합관리시스템] 연차 신청 알림';
  var dateTimeText = LEAVE_composeDateTimeText_(category, date, startTime, endTime);

  var appUrl = '';
  try{ appUrl = String(ScriptApp.getService().getUrl() || ''); }catch(e){}

  var lines = [
    '연차신청이 등록되었습니다.',
    '',
    '[연차정보]',
    '신청자: ' + (actor || '-'),
    '신청시각: ' + createdAtText,
    '',
    '연차대상자: ' + who,
    '연차일시: ' + dateTimeText,
    '연차일수: ' + days,
    ''
  ];
  if (appUrl) lines.push('시스템링크: ' + appUrl);

  var payload = {
    to: recipients.join(','),
    subject: subject,
    body: lines.join('\n'),
    name: '통합관리시스템'
  };
  var sent = false;
  try{
    if (typeof GmailApp !== 'undefined' && GmailApp && typeof GmailApp.sendEmail === 'function'){
      GmailApp.sendEmail(payload.to, payload.subject, payload.body, { name: payload.name });
      sent = true;
    }
  }catch(gerr){
    try{ console.warn('[LEAVE_sendApplyNoticeMail_] GmailApp failed, fallback MailApp: ' + (gerr && gerr.message ? gerr.message : String(gerr))); }catch(e){}
  }
  if (!sent){
    MailApp.sendEmail(payload.to, payload.subject, payload.body, { name: payload.name });
  }

  return { ok:true, sent: recipients.length };
}

function LEAVE_getUserEmailMaps_(){
  var out = { byEmpId:{}, byEmail:{} };
  try{
    var ss = LEAVE_ss_();
    var t = LEAVE_sheetValues_(ss, 'User');
    var h = t.header || [];
    var rows = t.rows || [];
    var cEmpId = LEAVE_findCol_(h, 'emp_id');
    var cEmail = LEAVE_findCol_(h, 'email');
    var cActive = LEAVE_findCol_(h, 'active');
    if (cEmpId < 0 || cEmail < 0 || cActive < 0) return out;

    for (var i=0; i<rows.length; i++){
      var r = rows[i] || [];
      if (!LEAVE_boolTrue_(r[cActive])) continue;
      var email = String(r[cEmail] || '').trim().toLowerCase();
      var empId = String(r[cEmpId] || '').trim();
      if (email){
        out.byEmail[email] = email;
        if (empId) out.byEmpId[empId] = email;
      }
    }
  }catch(e){}
  return out;
}

function LEAVE_getEmployeeEmailMap_(){
  var out = {};
  try{
    var ss = LEAVE_ss_();
    var t = LEAVE_sheetValues_(ss, 'Employee');
    var h = t.header || [];
    var rows = t.rows || [];
    var cId = LEAVE_findCol_(h, 'employee_id');
    var cEmail = LEAVE_findCol_(h, 'email');
    var cDel = LEAVE_findCol_(h, 'is_deleted');
    var cVis = LEAVE_findCol_(h, 'is_visible');
    if (cId < 0 || cEmail < 0) return out;

    for (var i=0; i<rows.length; i++){
      var r = rows[i] || [];
      var eid = String(r[cId] || '').trim();
      var email = String(r[cEmail] || '').trim().toLowerCase();
      if (!eid || !email) continue;
      if (cDel >= 0 && LEAVE_boolTrue_(r[cDel])) continue;
      if (cVis >= 0 && LEAVE_boolTrue_(r[cVis])) continue;
      out[eid] = email;
    }
  }catch(e){}
  return out;
}

function LEAVE_extractEmpIdFromActorLabel_(s){
  s = String(s || '').trim();
  if (!s) return '';
  var parts = s.split(/\s+/);
  if (!parts.length) return '';
  var token = String(parts[0] || '').trim();
  if (!token) return '';
  // 사번 형식이 숫자/영문+숫자 혼합일 수 있어 최소한 첫 토큰 사용
  return token;
}

function LEAVE_resolveEmailByEmpId_(empId, userMaps, employeeEmailMap){
  empId = String(empId || '').trim();
  if (!empId) return '';
  userMaps = userMaps || { byEmpId:{} };
  employeeEmailMap = employeeEmailMap || {};
  var e1 = userMaps.byEmpId && userMaps.byEmpId[empId] ? String(userMaps.byEmpId[empId]).trim().toLowerCase() : '';
  if (e1) return e1;
  var e2 = employeeEmailMap[empId] ? String(employeeEmailMap[empId]).trim().toLowerCase() : '';
  return e2 || '';
}

function LEAVE_resolveCreatorEmail_(createdBy, userMaps){
  var s = String(createdBy || '').trim();
  if (!s) return '';
  if (s.indexOf('@') >= 0){
    return s.toLowerCase();
  }
  var empId = LEAVE_extractEmpIdFromActorLabel_(s);
  if (!empId) return '';
  userMaps = userMaps || { byEmpId:{} };
  return (userMaps.byEmpId && userMaps.byEmpId[empId]) ? String(userMaps.byEmpId[empId]).trim().toLowerCase() : '';
}

function LEAVE_composeDateTimeText_(category, date, startTime, endTime){
  function tz_(){
    try{ return Session.getScriptTimeZone() || 'Asia/Seoul'; }catch(e){ return 'Asia/Seoul'; }
  }
  function fmtDate_(v){
    if (v == null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
      return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
    }
    var s = String(v).trim();
    if (!s) return '';
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    var m2 = s.match(/(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})/);
    if (m2) return m2[1] + '-' + String(m2[2]).padStart(2, '0') + '-' + String(m2[3]).padStart(2, '0');
    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
    return s;
  }
  function fmtTime_(v){
    if (v == null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
      return Utilities.formatDate(v, tz_(), 'HH:mm');
    }
    var s = String(v).trim();
    if (!s) return '';
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) return String(m[1]).padStart(2, '0') + ':' + m[2];
    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz_(), 'HH:mm');
    return s;
  }

  category = String(category || '').trim();
  var dTxt = fmtDate_(date);
  var stTxt = fmtTime_(startTime);
  var etTxt = fmtTime_(endTime);

  if (category === '시간'){
    var tm = (stTxt && etTxt) ? (stTxt + '~' + etTxt) : '';
    if (dTxt && tm) return dTxt + ' ' + tm;
    return dTxt || tm || '-';
  }
  return dTxt || '-';
}

function LEAVE_composeApplicantText_(employeeId, employeeName){
  var eid = String(employeeId || '').trim();
  var nm = String(employeeName || '').trim();
  if (eid && nm) return eid + ' ' + nm;
  return eid || nm || '-';
}

function LEAVE_sendStatusNoticeMail_(ctx){
  ctx = ctx || {};
  var recipients = Array.isArray(ctx.recipients) ? ctx.recipients : [];
  recipients = recipients.map(function(x){ return String(x || '').trim().toLowerCase(); }).filter(Boolean);
  var seen = {}, to = [];
  recipients.forEach(function(x){ if (!seen[x]) { seen[x] = 1; to.push(x); } });
  if (!to.length) return { ok:false, skipped:true, reason:'no_recipient' };

  var employeeId = String(ctx.employee_id || '').trim();
  var employeeName = String(ctx.employee_name || '').trim() || LEAVE_lookupEmployeeName_(employeeId);
  var status = String(ctx.status || '').trim();
  var category = String(ctx.category || '').trim();
  var date = String(ctx.date || '').trim();
  var startTime = String(ctx.start_time || '').trim();
  var endTime = String(ctx.end_time || '').trim();
  var days = String(ctx.days || '').trim();
  var createdBy = String(ctx.created_by || '').trim();
  var createdAt = ctx.created_at instanceof Date ? ctx.created_at : null;
  var appliedBy = String(ctx.applied_by || '').trim();
  var appliedAt = ctx.applied_at instanceof Date ? ctx.applied_at : new Date();

  var tz = 'Asia/Seoul';
  try{ tz = Session.getScriptTimeZone() || tz; }catch(e){}
  var createdAtText = createdAt ? Utilities.formatDate(createdAt, tz, 'yyyy-MM-dd HH:mm:ss') : '-';
  var appliedAtText = Utilities.formatDate(appliedAt, tz, 'yyyy-MM-dd HH:mm:ss');

  var who = LEAVE_composeApplicantText_(employeeId, employeeName);
  var subject = '[통합관리시스템] 연차 ' + status + ' 알림';
  var dateTimeText = LEAVE_composeDateTimeText_(category, date, startTime, endTime);
  var appUrl = '';
  try{ appUrl = String(ScriptApp.getService().getUrl() || ''); }catch(e){}

  var lines = [
    '신청한 연차가 ' + status + ' 처리되었습니다.',
    '',
    '[연차정보]',
    '신청자: ' + (createdBy || '-'),
    '신청시각: ' + createdAtText,
    '',
    '연차대상자: ' + who,
    '연차일시: ' + dateTimeText,
    '연차일수: ' + days,
    '',
    '처리자: ' + (appliedBy || '-'),
    '처리일시: ' + appliedAtText,
    '처리내용: ' + status,
    ''
  ];
  if (appUrl) lines.push('시스템링크: ' + appUrl);

  var sent = false;
  try{
    if (typeof GmailApp !== 'undefined' && GmailApp && typeof GmailApp.sendEmail === 'function'){
      GmailApp.sendEmail(to.join(','), subject, lines.join('\n'), { name: '통합관리시스템' });
      sent = true;
    }
  }catch(gerr){
    try{ console.warn('[LEAVE_sendStatusNoticeMail_] GmailApp failed, fallback MailApp: ' + (gerr && gerr.message ? gerr.message : String(gerr))); }catch(e){}
  }
  if (!sent){
    MailApp.sendEmail(to.join(','), subject, lines.join('\n'), { name: '통합관리시스템' });
  }
  return { ok:true, sent: to.length };
}

function LEAVE_listEmployeesForSetting(payload){
  payload = payload || {};
  var statusFilter = String(payload.status || '전체');

  try{
    var ss = LEAVE_ss_();
    var sh = ss.getSheetByName('Employee');
    if (!sh) return { ok:false, error:'Employee 시트를 찾을 수 없습니다.' };

    // ✅ 계약/경력 시트
    var shAg = ss.getSheetByName('Employee_Agreement');
    if (!shAg) return { ok:false, error:'Employee_Agreement 시트를 찾을 수 없습니다.' };
    var shEx = ss.getSheetByName('Employee_Experience');
    if (!shEx) return { ok:false, error:'Employee_Experience 시트를 찾을 수 없습니다.' };

    // ✅ 기준일(오늘) - 날짜만 사용
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    var values = LEAVE_sheetMatrixBySheet_(sh);
    if (!values || values.length < 2) return { ok:true, rows:[] };

    var header = values[0].map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(header);

    function pick(row, keys){
      for (var i=0; i<keys.length; i++){
        var k = keys[i];
        var p = idx[k];
        if (p != null){
          var v = row[p];
          if (v !== '' && v != null) return v;
        }
      }
      return '';
    }
    // ======================================================
    // 1) 계약맵(현재 유효 계약의 start_date) 구성
    //    - 유효: start_date <= today && (end_date 비었거나 end_date >= today)
    //    - 여러 개면: 가장 최근 start_date 선택
    // ======================================================
    var agVals = LEAVE_sheetMatrixBySheet_(shAg);
    var agHead = (agVals && agVals.length) ? agVals[0].map(function(v){ return String(v||'').trim(); }) : [];
    var agIdx  = indexMap_(agHead);
    var agMap  = {}; // employee_id -> Date(start)

    function agPick(row, key){ var p = agIdx[key]; return (p!=null) ? row[p] : ''; }
    function isDeletedRow_(row, idxMap){
      var p = idxMap['is_deleted'];
      if (p == null) return false;
      var v = row[p];
      if (v === 1 || v === '1') return true;
      if (v === true) return true;
      if (typeof v === 'string' && v.trim().toLowerCase() === 'true') return true;
      return false;
    }
    for (var i=1; i<(agVals||[]).length; i++){
      var r = agVals[i];
      if (!r || r.length===0) continue;
      if (isDeletedRow_(r, agIdx)) continue; // ✅ soft delete 제외
      var eid = String(agPick(r,'employee_id')||'').trim();
      if (!eid) continue;
      var sdt = parseDate_(agPick(r,'start_date'));
      var edt = parseDate_(agPick(r,'end_date'));
      if (!sdt) continue;
      sdt = new Date(sdt.getFullYear(), sdt.getMonth(), sdt.getDate());
      if (edt) edt = new Date(edt.getFullYear(), edt.getMonth(), edt.getDate());

      var valid = (sdt.getTime() <= today.getTime()) && (!edt || edt.getTime() >= today.getTime());
      if (!valid) continue;

      // 최신 start_date 우선
      var cur = agMap[eid];
      if (!cur || cur.getTime() < sdt.getTime()) agMap[eid] = sdt;
    }

    // ======================================================
    // 2) 적용경력(개월) 합계 맵 구성
    //    - category: 내부경력(적용), 외부경력(적용)
    //    - period: 개월
    // ======================================================
    var exVals = LEAVE_sheetMatrixBySheet_(shEx);
    var exHead = (exVals && exVals.length) ? exVals[0].map(function(v){ return String(v||'').trim(); }) : [];
    var exIdx  = indexMap_(exHead);
    var exMap  = {}; // employee_id -> monthsSum

    function exPick(row, key){ var p = exIdx[key]; return (p!=null) ? row[p] : ''; }
    for (var j=1; j<(exVals||[]).length; j++){
      var rr = exVals[j];
      if (!rr || rr.length===0) continue;
      if (isDeletedRow_(rr, exIdx)) continue; // ✅ soft delete 제외
      var ee = String(exPick(rr,'employee_id')||'').trim();
      if (!ee) continue;
      var cat = String(exPick(rr,'category')||'').trim();
      if (cat !== '내부경력(적용)' && cat !== '외부경력(적용)') continue;
      // period가 "10개월" 같은 문자열일 수 있으므로 숫자만 파싱
      var mo = parseMonths_(exPick(rr,'period'));
      exMap[ee] = (exMap[ee] || 0) + mo;
    }

    // ======================================================
    // 3) 총근무연수/총근무연차 계산(직원별)
    //    - 재직기간: current valid agreement start_date ~ today (inclusive)
    //    - 적용경력: expMonths(개월) 합산
    //    - totalDa >= 30 -> totalMo로 이월 (30일=1개월)
    //    - yearcount: units=(totalMo*30)+totalDa, year=floor((max(units,1)-1)/360)+1
    // ======================================================
    function calcWork_(contractStart, expMonths){
      expMonths = Number(expMonths || 0);
      if (!isFinite(expMonths)) expMonths = 0;
      if (!contractStart) return { working_period:'', working_yearcount:'' };

      var tenure = diffMonthsDaysInclusiveObj_(contractStart, today); // {months, days}
      var totalMo = (tenure.months || 0) + expMonths;
      var totalDa = (tenure.days || 0);

      if (totalDa >= 30){
        totalMo += Math.floor(totalDa / 30);
        totalDa = totalDa % 30;
      }

      var periodTxt = fmtMdText_(totalMo, totalDa);
      var units = (totalMo * 30) + totalDa;
      var year = Math.floor((Math.max(units, 1) - 1) / 360) + 1;
      var ycTxt = year + '년차';

      return { working_period: periodTxt, working_yearcount: ycTxt };
    }

    var out = [];
    for (var r=1; r<values.length; r++){
      var row = values[r];
      if (!row || row.length === 0) continue;

      // ✅ Employee: is_deleted=1 제외
      var isDel = String(pick(row, ['is_deleted']) || '').trim();
      if (isDel === '1' || isDel.toLowerCase() === 'true') continue;

      // ✅ Employee: is_visible=1(숨김) 제외
      var isVis = String(pick(row, ['is_visible']) || '').trim();
      if (isVis === '1' || isVis.toLowerCase() === 'true') continue;

      // ✅ 요구사항: 고용구분(category)이 있는 직원만
      var category = String(pick(row, ['category']) || '').trim();
      if (!category) continue;

      // ✅ status는 DB 저장 안 함 -> 계약 유효여부로 실시간 산정
      var eid0 = String(pick(row, ['employee_id']) || '').trim();
      var hasValid = !!agMap[eid0];
      var status = hasValid ? '재직' : '퇴직';
      if (statusFilter !== '전체' && status && status !== statusFilter) continue;
      if (statusFilter !== '전체' && !status) {
        // status가 비어있으면 필터링 시 제외(보수적으로)
        continue;
      }

      out.push({
        employee_id: eid0,
        // ✅ 사번=employee_id 로 확정
        emp_no: eid0,
        name: String(pick(row, ['name']) || ''),
        category: category,
        manage: String(pick(row, ['manage']) || ''),
        status: status,
        // ✅ 실시간 계산 (employee.html 로직 기반)
        work: calcWork_(agMap[eid0] || null, exMap[eid0] || 0)
      });
    }

    // 정렬: 사번 기준(문자열) 오름차순
    out.sort(function(a,b){
      return String(a.emp_no||'').localeCompare(String(b.emp_no||''), 'ko');
    });

    return { ok:true, rows: out };
  }catch(err){
    return { ok:false, error: (err && err.message) ? err.message : String(err) };
  }
}

// "n개월 n일" 포맷(0이면 빈값)
function fmtMdText_(months, days){
  months = Number(months || 0); if (!isFinite(months)) months = 0;
  days   = Number(days   || 0); if (!isFinite(days))   days   = 0;
  if (months <= 0 && days <= 0) return '';
  if (days <= 0) return months + '개월';
  if (months <= 0) return days + '일';
  return months + '개월 ' + days + '일';
}

// inclusive diff: start~end 날짜를 "포함"해서 개월/일 계산
// 구현: end에 +1일 한 뒤, 일반 달력 diffYMD로 계산 -> (y,m,d) => months=y*12+m, days=d
function diffMonthsDaysInclusiveObj_(start, end){
  if (!start || !end) return { months:0, days:0 };
  var s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  var e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (e.getTime() < s.getTime()) return { months:0, days:0 };
  var ePlus = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1); // ✅ inclusive
  var ymd = diffYMD_(s, ePlus);
  return { months: (ymd.y*12 + ymd.m), days: ymd.d };
}

// "10", "10.5", "10개월", "10 개월", "10개월 0일" 등에서 개월 숫자만 추출
function parseMonths_(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return (isFinite(v) ? v : 0);
  if (Object.prototype.toString.call(v) === '[object Date]') return 0;
  var s = String(v).trim();
  if (!s) return 0;
  // 가장 앞에 나오는 숫자(정수/소수) 추출
 var m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  var n = Number(m[1]);
  return isFinite(n) ? n : 0;
}

function indexMap_(header){
  var m = {};
  for (var i=0; i<header.length; i++){
    var k = String(header[i]||'').trim();
    if (!k) continue;
    m[k] = i;
  }
  return m;
}

function parseDate_(v){
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return v;
  var s = String(v).trim();
  if (!s) return null;
  // YYYY-MM-DD / YYYY.MM.DD / YYYYMMDD
  var m = s.match(/^(\d{4})[-\.]?(\d{2})[-\.]?(\d{2})/);
  if (!m) return null;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  var dt = new Date(y, mo-1, d);
  if (dt.getFullYear() !== y || (dt.getMonth()+1) !== mo || dt.getDate() !== d) return null;
  return dt;
}

// 달력 기준 diff (년/월/일) - end >= start 가정(아니면 0으로 수렴)
function diffYMD_(start, end){
  if (!start || !end) return { y:0, m:0, d:0 };
  var s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  var e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (e.getTime() <= s.getTime()) return { y:0, m:0, d:0 };

  var y = e.getFullYear() - s.getFullYear();
  var m = e.getMonth() - s.getMonth();
  var d = e.getDate() - s.getDate();

  if (d < 0){
    // 직전월의 일수를 빌림
    var prev = new Date(e.getFullYear(), e.getMonth(), 0); // 전월 마지막날
    d += prev.getDate();
    m -= 1;
  }
  if (m < 0){
    m += 12;
    y -= 1;
  }
  if (y < 0) return { y:0, m:0, d:0 };
  return { y:y, m:m, d:d };
}

// =========================================================
// ✅ 연차설정 저장 (Leave 시트)
// - year 기준으로 upsert
// - payload.rows에 없는 기존 직원(해당 year)은 soft delete(is_deleted=1)
// - Leave 시트 헤더가 없으면 자동 생성
// =========================================================
function LEAVE_saveLeaveSettings__DUP_DO_NOT_USE__(payload){
  payload = payload || {};
  var year = Number(payload.year);
  var rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!isFinite(year)) return { ok:false, error:'year가 올바르지 않습니다.' };
  
  return { ok:false, error:'DEPRECATED: LEAVE_saveLeaveSettings__DUP_DO_NOT_USE__ 호출됨 (LEAVE_saveLeaveSettings를 사용하세요)' };

  try{
    var ss = LEAVE_ss_();
    var sh = ss.getSheetByName('Leave');
    if (!sh) sh = ss.insertSheet('Leave');

    var actorObj = null;
    var actorLabel = '';
    try{
      if (typeof DB_getActor_ === 'function') actorObj = DB_getActor_();
    }catch(e){}
    try{
      if (actorObj && typeof DB_actorLabel_ === 'function') actorLabel = DB_actorLabel_(actorObj);
    }catch(e){}
    if (!actorLabel){
      try{ actorLabel = String(Session.getActiveUser().getEmail() || ''); }catch(e){}
    }
    var now = new Date();

    var HEAD = [
      'leave_id',
      'year',
      'employee_id',
      'statutory_days',
      'grant_days',
      'official_days',
      'unofficial_days',
      'note',
      'created_at',
      'created_by',
      'updated_at',
      'updated_by',
      'is_deleted'
    ];

    // 헤더 보장
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1){
      sh.getRange(1,1,1,HEAD.length).setValues([HEAD]);
      lastRow = 1;
      lastCol = HEAD.length;
    }else{
      var h = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(v){ return String(v||'').trim(); });
      var okHeader = h.join('|').indexOf('employee_id') >= 0 && h.join('|').indexOf('year') >= 0;
      if (!okHeader){
        sh.getRange(1,1,1,HEAD.length).setValues([HEAD]);
        lastCol = HEAD.length;
      }else{
        // 부족 컬럼이 있으면 확장(뒤에 추가)
        var exist = {};
        h.forEach(function(k){ if (k) exist[k]=true; });
        var add = HEAD.filter(function(k){ return !exist[k]; });
        if (add.length){
          sh.getRange(1, lastCol+1, 1, add.length).setValues([add]);
          lastCol += add.length;
        }
      }
    }

    // 인덱스 맵
    var header = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(header);
    function col(key){ return idx[key]; }

    var needKeys = ['leave_id','year','employee_id','statutory_days','grant_days','official_days','unofficial_days','note','created_at','created_by','updated_at','updated_by','is_deleted'];
    for (var i=0;i<needKeys.length;i++){
      if (col(needKeys[i]) == null) return { ok:false, error:'Leave 시트 컬럼이 누락되었습니다: ' + needKeys[i] };
    }

    // 기존 데이터 로드
    var data = LEAVE_sheetMatrixBySheet_(sh);
    var existMap = {}; // employee_id -> rowIndex(1-based)
    for (var r=1; r<data.length; r++){
      var row = data[r];
      var y = Number(row[col('year')]);
      if (!isFinite(y) || y !== year) continue;
      var del = row[col('is_deleted')];
      var isDel = (del === 1 || del === '1' || del === true || (typeof del === 'string' && del.trim().toLowerCase()==='true'));
      if (isDel) continue;
      var eid = String(row[col('employee_id')]||'').trim();
      if (!eid) continue;
      existMap[eid] = r+1; // sheet row
    }

    var incoming = {};
    rows.forEach(function(x){
      if (!x) return;
      var eid = String(x.employee_id||'').trim();
      if (!eid) return;
      incoming[eid] = x;
    });

    var updates = [];
    var updateRanges = [];

    // 1) 기존에 있는데 payload에 없는 건 soft delete
    Object.keys(existMap).forEach(function(eid){
      if (incoming[eid]) return;
      var rr = existMap[eid];
      var row = sh.getRange(rr,1,1,sh.getLastColumn()).getValues()[0];
      row[col('is_deleted')] = 1;
      row[col('updated_at')] = now;
      row[col('updated_by')] = actor;
      updateRanges.push(sh.getRange(rr,1,1,sh.getLastColumn()));
      updates.push([row]);
    });

    // 2) upsert
    Object.keys(incoming).forEach(function(eid){
      var x = incoming[eid];
      var statutory = Number(x.statutory_days||0); if (!isFinite(statutory)) statutory = 0;
      var grant     = Number(x.grant_days||0);     if (!isFinite(grant)) grant = 0;
      var official  = Number(x.official_days||0);  if (!isFinite(official)) official = 0;
      var unoff     = Number(x.unofficial_days||0);if (!isFinite(unoff)) unoff = Math.max(grant-official,0);
      var note      = String(x.note||'');

      var rr = existMap[eid];
      if (rr){
        var row = sh.getRange(rr,1,1,sh.getLastColumn()).getValues()[0];
        row[col('year')] = year;
        row[col('employee_id')] = eid;
        row[col('statutory_days')] = statutory;
        row[col('grant_days')] = grant;
        row[col('official_days')] = official;
        row[col('unofficial_days')] = unoff;
        row[col('note')] = note;
        row[col('is_deleted')] = 0;
        row[col('updated_at')] = now;
        row[col('updated_by')] = actor;
        updateRanges.push(sh.getRange(rr,1,1,sh.getLastColumn()));
        updates.push([row]);
      }else{
        var newRow = new Array(sh.getLastColumn()).fill('');
        newRow[col('leave_id')] = Utilities.getUuid();
        newRow[col('year')] = year;
        newRow[col('employee_id')] = eid;
        newRow[col('statutory_days')] = statutory;
        newRow[col('grant_days')] = grant;
        newRow[col('official_days')] = official;
        newRow[col('unofficial_days')] = unoff;
        newRow[col('note')] = note;
        newRow[col('created_at')] = now;
        newRow[col('created_by')] = actor;
        newRow[col('updated_at')] = now;
        newRow[col('updated_by')] = actor;
        newRow[col('is_deleted')] = 0;
        sh.appendRow(newRow);
      }
    });

    // 업데이트 일괄 적용
    for (var u=0; u<updateRanges.length; u++){
      updateRanges[u].setValues(updates[u]);
    }

    return { ok:true };
  }catch(err){
    return { ok:false, error:(err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ 연차설정 저장 (Leave 시트)
// - year 기준으로 upsert
// - payload.rows에 없는 기존 직원(해당 year)은 soft delete(is_deleted=1)
// - Leave 시트 헤더가 없으면 자동 생성
// =========================================================
function LEAVE_saveLeaveSettings(payload){
  payload = payload || {};
  var year = Number(payload.year);
  var rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!isFinite(year)) return { ok:false, error:'year가 올바르지 않습니다.' };
  // ✅ DB에는 "2025년" 형태로 저장 (조회는 Number("2025년")로도 정상 필터링됨)
  var yearLabel = year + '년';

  try{
    LEAVE_assertPerm_('btn:leave:set');

    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      var ss = LEAVE_ss_();
      var sh = ss.getSheetByName('Leave');
      if (!sh) sh = ss.insertSheet('Leave');

    // ✅ created_by/updated_by: "emp_id emp_name" 형식으로 저장
    var actorObj = null;
    var actorLabel = '';
    try{
      if (typeof DB_getActor_ === 'function') actorObj = DB_getActor_();
    }catch(e){}
    try{
      if (actorObj && typeof DB_actorLabel_ === 'function') actorLabel = DB_actorLabel_(actorObj);
    }catch(e){}
    if (!actorLabel){
      try{ actorLabel = String(Session.getActiveUser().getEmail() || ''); }catch(e){}
    }
    var now = new Date();

    var HEAD = [
      'leave_id',
      'year',
      'employee_id',
      'grant_days',
      'official_days',
      'unofficial_days',
      'note',
      'created_at',
      'created_by',
      'updated_at',
      'updated_by',
      'is_deleted'
    ];

    // 헤더 보장
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1){
      sh.getRange(1,1,1,HEAD.length).setValues([HEAD]);
      lastRow = 1;
      lastCol = HEAD.length;
    }else{
      var h = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(v){ return String(v||'').trim(); });
      var okHeader = h.join('|').indexOf('employee_id') >= 0 && h.join('|').indexOf('year') >= 0;
      if (!okHeader){
        sh.getRange(1,1,1,HEAD.length).setValues([HEAD]);
        lastCol = HEAD.length;
      }else{
        // 부족 컬럼이 있으면 확장(뒤에 추가)
        var exist = {};
        h.forEach(function(k){ if (k) exist[k]=true; });
        var add = HEAD.filter(function(k){ return !exist[k]; });
        if (add.length){
          sh.getRange(1, lastCol+1, 1, add.length).setValues([add]);
          lastCol += add.length;
        }
      }
    }

    // 인덱스 맵
    var header = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(header);
    function col(key){ return idx[key]; }
    var cStat = col('statutory_days'); // ✅ 있을 수도/없을 수도 (DB 입력 제외)

    // ✅ statutory_days는 DB 저장/헤더 생성 모두 제외
    var needKeys = ['leave_id','year','employee_id','grant_days','official_days','unofficial_days','note','created_at','created_by','updated_at','updated_by','is_deleted'];
    for (var i=0;i<needKeys.length;i++){
      if (col(needKeys[i]) == null) return { ok:false, error:'Leave 시트 컬럼이 누락되었습니다: ' + needKeys[i] };
    }

    // 기존 데이터 로드
    var data = LEAVE_sheetMatrixBySheet_(sh);
    var existMap = {};   // employee_id -> rowIndex(1-based)  (is_deleted=0)
    var deletedMap = {}; // employee_id -> rowIndex(1-based)  (is_deleted=1)  ✅ 복구 대상
    for (var r=1; r<data.length; r++){
      var row = data[r];
      // ✅ DB year가 "2025", 2025, "2025년" 모두 매칭되도록
      var yRaw = String(row[col('year')] || '').trim();
      var ym = yRaw.match(/(\d{4})/);
      var y = ym ? Number(ym[1]) : Number(yRaw);
      if (!isFinite(y) || y !== year) continue;

      var eid = String(row[col('employee_id')]||'').trim();
      if (!eid) continue;

      var del = row[col('is_deleted')];
      var isDel = (del === 1 || del === '1' || del === true || (typeof del === 'string' && del.trim().toLowerCase()==='true'));

      // ✅ 같은 (year,eid) 중 삭제행이 있으면 복구 대상으로 보관
      // - 동일 키가 여러 개면 "마지막에 나온 행(시트 아래쪽)"을 우선으로 둠(일반적으로 최신)
      if (isDel){
        deletedMap[eid] = r+1;
      }else{
        existMap[eid] = r+1;
      }
    }

    var incoming = {};
    rows.forEach(function(x){
      if (!x) return;
      var eid = String(x.employee_id||'').trim();
      if (!eid) return;
      incoming[eid] = x;
    });

    var updates = [];
    var updateRanges = [];

    // 1) 기존에 있는데 payload에 없는 건 soft delete
    Object.keys(existMap).forEach(function(eid){
      if (incoming[eid]) return;
      var rr = existMap[eid];
      var row = sh.getRange(rr,1,1,sh.getLastColumn()).getValues()[0];
      row[col('is_deleted')] = 1;
      row[col('updated_at')] = now;
      row[col('updated_by')] = actorLabel;
      updateRanges.push(sh.getRange(rr,1,1,sh.getLastColumn()));
      updates.push([row]);
    });

    // 2) upsert
    Object.keys(incoming).forEach(function(eid){
      var x = incoming[eid];
      var grant     = Number(x.grant_days||0);     if (!isFinite(grant)) grant = 0;
      var official  = Number(x.official_days||0);  if (!isFinite(official)) official = 0;
      var unoff     = Number(x.unofficial_days||0);if (!isFinite(unoff)) unoff = Math.max(grant-official,0);
      var note      = String(x.note||'');

      // ✅ 활성행이 있으면 그 행 업데이트
      // ✅ 활성행이 없고 삭제행이 있으면: 새행 추가 금지, 삭제행을 복구(undelete)해서 업데이트
      var rr = existMap[eid] || deletedMap[eid];
      if (rr){
        var wasDeleted = (!existMap[eid] && !!deletedMap[eid]);
        var row = sh.getRange(rr,1,1,sh.getLastColumn()).getValues()[0];
        // ✅ 변경된 경우에만 update (변경 없으면 updated_at/by 유지)
        var changed = false;
        function cell_(k){
          var p = col(k);
          return (p == null) ? '' : row[p];
        }
        function normYearStr_(v){
          var s = String(v == null ? '' : v).trim();
          var m = s.match(/(\d{4})/);
          return m ? (m[1] + '년') : s; // 비교는 "YYYY년" 기준으로 통일
        }
        function num0_(v){
          if (v == null || v === '') return 0;
          var n = Number(v);
          return isFinite(n) ? n : 0;
        }
        function del0_(v){
          if (v === 1 || v === '1' || v === true) return 1;
          if (typeof v === 'string' && v.trim().toLowerCase() === 'true') return 1;
          return 0;
        }

        if (normYearStr_(cell_('year')) !== String(yearLabel)) changed = true;
        if (String(cell_('employee_id') == null ? '' : cell_('employee_id')).trim() !== String(eid)) changed = true;
        if (num0_(cell_('grant_days')) !== grant) changed = true;
        if (num0_(cell_('official_days')) !== official) changed = true;
        if (num0_(cell_('unofficial_days')) !== unoff) changed = true;
        if (String(cell_('note') == null ? '' : cell_('note')) !== String(note)) changed = true;
        // ✅ 삭제행 복구는 항상 변경으로 간주
        if (del0_(cell_('is_deleted')) !== 0) changed = true;

        if (changed){
          row[col('year')] = yearLabel;
          row[col('employee_id')] = eid;
          // ✅ statutory_days는 DB 입력 제외 -> 기존값 유지(건드리지 않음)
          row[col('grant_days')] = grant;
          row[col('official_days')] = official;
          row[col('unofficial_days')] = unoff;
          row[col('note')] = note;
          row[col('is_deleted')] = 0;
          // ✅ created_at/by는 유지 (복구/수정 모두 생성정보는 그대로)
          row[col('updated_at')] = now;
          row[col('updated_by')] = actorLabel;
          updateRanges.push(sh.getRange(rr,1,1,sh.getLastColumn()));
          updates.push([row]);
        }
      }else{
        var newRow = new Array(sh.getLastColumn()).fill('');
        newRow[col('leave_id')] = Utilities.getUuid();
        newRow[col('year')] = yearLabel;
        newRow[col('employee_id')] = eid;
        // ✅ statutory_days는 DB 입력 제외 (컬럼이 있으면 빈값 유지)
        if (cStat != null) newRow[cStat] = '';
        newRow[col('grant_days')] = grant;
        newRow[col('official_days')] = official;
        newRow[col('unofficial_days')] = unoff;
        newRow[col('note')] = note;
        newRow[col('created_at')] = now;
        newRow[col('created_by')] = actorLabel;
        newRow[col('updated_at')] = now;
        newRow[col('updated_by')] = actorLabel;
        newRow[col('is_deleted')] = 0;
        sh.appendRow(newRow);
      }
    });

    // 업데이트 일괄 적용
    for (var u=0; u<updateRanges.length; u++){
      updateRanges[u].setValues(updates[u]);
    }

      if (typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Leave');
      return { ok:true };
    } finally {
      lock.releaseLock();
    }
  }catch(err){
    return { ok:false, error:(err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ 연차설정 조회 (Leave 시트)
// - year 기준 조회
// - is_deleted == 1 제외
// - 화면 표시용(직원명/근무/법정연차)은 프론트에서 Employee 캐시로 계산
// =========================================================
function LEAVE_getLeaveSettings(payload){
  payload = payload || {};

  // ✅ "2025", 2025, "2025년" 모두 허용
  var year = payload.year;
  if (typeof year === 'string'){
    var m = year.match(/(\d{4})/);
    year = m ? Number(m[1]) : Number(year);
  }else{
    year = Number(year);
  }
  if (!isFinite(year)) return { ok:false, error:'year가 올바르지 않습니다.' };

  try{
    var ss = LEAVE_ss_();
    var sh = ss.getSheetByName('Leave');
    if (!sh) return { ok:true, rows:[] };

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { ok:true, rows:[] };

    var values = sh.getRange(1,1,lastRow,lastCol).getValues();
    var head = (values[0] || []).map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(head);

    function v(row, key){
      var i = idx[key]; // ✅ map 접근
      return (i == null) ? '' : row[i];
    }

    var out = [];
    for (var r=1; r<values.length; r++){
      var row = values[r];
      // ✅ DB의 "2025", 2025, "2025년" 모두 허용해서 필터
      var yRaw = String(v(row,'year') || '').trim();
      var ym = yRaw.match(/(\d{4})/);
      var y = ym ? Number(ym[1]) : Number(yRaw);
      if (!isFinite(y) || y !== year) continue;
      var del = String(v(row,'is_deleted') || '').trim();
      if (del === '1') continue;

      out.push({
        leave_id: v(row,'leave_id'),
        year: y,
        employee_id: String(v(row,'employee_id') || '').trim(),
        grant_days: v(row,'grant_days'),
        official_days: v(row,'official_days'),
        unofficial_days: v(row,'unofficial_days'),
        note: v(row,'note')
      });
    }
    return { ok:true, rows: out };
  }catch(err){
    return { ok:false, error:(err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ 연차 페이지: 적용연도 목록 (Leave.year 중복 제거)
// - 기본: is_deleted != 1 인 행만 기준
// - year 값은 "2025", 2025, "2025년" 모두 허용 -> 반환은 "2025년" 형태로 통일
// =========================================================
function LEAVE_listYears(payload){
  payload = payload || {};
  var onlyActive = (payload.only_active !== false); // default true

  try{
    var ss = LEAVE_ss_();
    var sh = ss.getSheetByName('Leave');
    if (!sh) return { ok:true, years:[] };

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { ok:true, years:[] };

    var values = sh.getRange(1,1,lastRow,lastCol).getValues();
    var head = (values[0] || []).map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(head);

    function v(row, key){
      var i = idx[key];
      return (i == null) ? '' : row[i];
    }
    function isDeleted_(row){
      var d = String(v(row,'is_deleted') || '').trim();
      return (d === '1' || d.toLowerCase() === 'true');
    }
    function yearNum_(yRaw){
      yRaw = String(yRaw || '').trim();
      var m = yRaw.match(/(\d{4})/);
      var n = m ? Number(m[1]) : Number(yRaw);
      return isFinite(n) ? n : NaN;
    }
    function yearLabel_(n){
      return n + '년';
    }

    var map = {}; // num -> label
    for (var r=1; r<values.length; r++){
      var row = values[r];
      if (onlyActive && isDeleted_(row)) continue;
      var n = yearNum_(v(row,'year'));
      if (!isFinite(n)) continue;
      map[n] = yearLabel_(n);
    }

    var nums = Object.keys(map).map(function(k){ return Number(k); }).filter(function(n){ return isFinite(n); });
    nums.sort(function(a,b){ return a-b; });
    return { ok:true, years: nums.map(function(n){ return map[n]; }) };
  }catch(err){
    return { ok:false, error:(err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ 연차 페이지: 적용연도별 직원명단(부여/사용/잔여 계산)
// - Leave: year+employee_id + is_deleted=0
//   * 부여 = unofficial_days (숫자) -> "n일"
// - Leave_Apply: date 연도 == 적용연도 && employee_id 일치 && status=="승인" && is_deleted=0
//   * days: "1일" | "8시간" | "1일 4시간" 등
//   * 8시간 = 1일로 환산
// - 잔여 = 부여 - 사용 (0 미만이면 0으로)
// - name은 Employee 시트에서 employee_id 매핑
// =========================================================
function LEAVE_listLeaveEmployees(payload){
  payload = payload || {};
  var yearRaw = payload.year;

  function parseYearNum_(v){
    if (v == null) return NaN;
    var s = String(v).trim();
    var m = s.match(/(\d{4})/);
    var n = m ? Number(m[1]) : Number(s);
    return isFinite(n) ? n : NaN;
  }
  var yearNum = parseYearNum_(yearRaw);
  if (!isFinite(yearNum)) return { ok:false, error:'year가 올바르지 않습니다.' };

  try{
    var ss = LEAVE_ss_();

    // 1) Employee name map
    var empName = {};
    (function buildEmpNameMap_(){
      var shE = ss.getSheetByName('Employee');
      if (!shE) return;
      var vr = LEAVE_sheetMatrixBySheet_(shE);
      if (!vr || vr.length < 2) return;
      var h = vr[0].map(function(x){ return String(x||'').trim(); });
      var im = indexMap_(h);
      var cId = im['employee_id'];
      var cNm = im['name'];
      var cDel= im['is_deleted'];
      var cVis= im['is_visible'];
      for (var i=1; i<vr.length; i++){
        var row = vr[i];
        if (!row) continue;
        if (cDel != null){
          var d = String(row[cDel] || '').trim();
          if (d === '1' || d.toLowerCase() === 'true') continue;
        }
        if (cVis != null){
          var v = String(row[cVis] || '').trim();
          if (v === '1' || v.toLowerCase() === 'true') continue;
        }
        var eid = (cId != null) ? String(row[cId]||'').trim() : '';
        if (!eid) continue;
        empName[eid] = (cNm != null) ? String(row[cNm]||'').trim() : '';
      }
    })();

    // 2) Leave rows for year
    var shL = ss.getSheetByName('Leave');
    if (!shL) return { ok:true, rows:[] };
    var lastRow = shL.getLastRow();
    var lastCol = shL.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { ok:true, rows:[] };

    var values = shL.getRange(1,1,lastRow,lastCol).getValues();
    var head = (values[0] || []).map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(head);

    function v(row, key){
      var i = idx[key];
      return (i == null) ? '' : row[i];
    }
    function isDeleted_(row){
      var d = String(v(row,'is_deleted') || '').trim();
      return (d === '1' || d.toLowerCase() === 'true');
    }
    function num_(x){
      var n = Number(x);
      return isFinite(n) ? n : NaN;
    }

    // employee_id -> grantDays (unofficial_days)
    var grantMap = {};
    for (var r=1; r<values.length; r++){
      var row = values[r];
      if (isDeleted_(row)) continue;
      var y = parseYearNum_(v(row,'year'));
      if (!isFinite(y) || y !== yearNum) continue;
      var eid = String(v(row,'employee_id') || '').trim();
      if (!eid) continue;
      var grant = num_(v(row,'unofficial_days'));
      if (!isFinite(grant)) grant = 0;
      grantMap[eid] = grant;
    }

    var eids = Object.keys(grantMap);
    if (!eids.length) return { ok:true, rows:[] };

    // 3) Used from Leave_Apply
    var usedMin = {}; // eid -> minutes
    (function calcUsed_(){
      var shA = ss.getSheetByName('Leave_Apply');
      if (!shA) return;
      var vr = LEAVE_sheetMatrixBySheet_(shA);
      if (!vr || vr.length < 2) return;
      var h = vr[0].map(function(x){ return String(x||'').trim(); });
      var im = indexMap_(h);

      function p(row, key){
        var i = im[key];
        return (i == null) ? '' : row[i];
      }
      function isDelRow_(row){
        var d = String(p(row,'is_deleted') || '').trim();
        return (d === '1' || d.toLowerCase() === 'true');
      }
      function yearOfDate_(dv){
        if (!dv) return NaN;
        if (Object.prototype.toString.call(dv) === '[object Date]' && !isNaN(dv.getTime())) return dv.getFullYear();
        var s = String(dv).trim();
        if (!s) return NaN;
        var m = s.match(/(\d{4})/);
        return m ? Number(m[1]) : NaN;
      }

      function parseDaysHours_(dv){
        var s = String(dv == null ? '' : dv).trim();
        if (!s) return { d:0, h:0 };
        var md = s.match(/(\d+)\s*일/);
        var mh = s.match(/(\d+)\s*시간/);
        var d = md ? Number(md[1]) : 0;
        var h = mh ? Number(mh[1]) : 0;
        if (!isFinite(d)) d = 0;
        if (!isFinite(h)) h = 0;
        return { d:d, h:h };
      }
      function toMinutes_(d, h){
        d = Number(d||0); h = Number(h||0);
        if (!isFinite(d)) d = 0;
        if (!isFinite(h)) h = 0;
        return (d * 8 * 60) + (h * 60);
      }

      for (var i=1; i<vr.length; i++){
        var row = vr[i];
        if (!row) continue;
        if (isDelRow_(row)) continue;
        var y = yearOfDate_(p(row,'date'));
        if (!isFinite(y) || y !== yearNum) continue;
        var eid = String(p(row,'employee_id') || '').trim();
        if (!eid) continue;
        if (!grantMap.hasOwnProperty(eid)) continue;
        var st = String(p(row,'status') || '').trim();
        if (st !== '승인') continue;
        var dh = parseDaysHours_(p(row,'days'));
        usedMin[eid] = (usedMin[eid] || 0) + toMinutes_(dh.d, dh.h);
      }
    })();

    function fmtMin_(mins){
      mins = Math.max(0, Math.floor(Number(mins||0)));
      if (!isFinite(mins)) mins = 0;
      var d = Math.floor(mins / (8*60));
      var rem = mins % (8*60);
      var h = Math.floor(rem / 60);
      if (h >= 8){
        d += Math.floor(h/8);
        h = h % 8;
      }
      // ✅ 표기 규칙:
      // - 0일 0시간 => 0일
      // - 1일 0시간 => 1일
      // - 0일 2시간 => 2시간
      // - 그 외 => 1일 2시간
      var txt = '';
      if (d > 0 && h > 0) txt = d + '일 ' + h + '시간';
      else if (d > 0 && h === 0) txt = d + '일';
      else if (d === 0 && h > 0) txt = h + '시간';
      else txt = '0일';
      return { d:d, h:h, txt: txt };
    }

    var out = eids.map(function(eid){
      var grantDays = Number(grantMap[eid] || 0);
      if (!isFinite(grantDays)) grantDays = 0;

      var grantM = grantDays * 8 * 60;
      var usedM  = Number(usedMin[eid] || 0);
      if (!isFinite(usedM)) usedM = 0;
      var remainM = grantM - usedM;
      if (remainM < 0) remainM = 0;

      var usedObj = fmtMin_(usedM);
      var remObj  = fmtMin_(remainM);

      return {
        employee_id: eid,
        name: empName[eid] || '',
        grant_days: grantDays,
        grant_txt: grantDays + '일',
        used_days: usedObj.d,
        used_hours: usedObj.h,
        used_txt: usedObj.txt,
        remain_days: remObj.d,
        remain_hours: remObj.h,
        remain_txt: remObj.txt
      };
    });

    out.sort(function(a,b){
      return String(a.employee_id||'').localeCompare(String(b.employee_id||''), 'ko', { numeric:true });
    });

    return { ok:true, rows: out };
  }catch(err){
    return { ok:false, error:(err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ 메인페이지: 연차정보(Leave_Apply) 조회
// - year: Leave_Apply에 year 컬럼이 없으므로 date(yyyy-mm-dd)의 연도로 필터
// - is_deleted=0만
// - employee_name은 Employee 시트에서 employee_id -> name 매핑
// =========================================================
function LEAVE_listLeaveApplies(payload){
  payload = payload || {};
  var yearRaw = payload.year;

  function parseYearNum_(v){
    if (v == null) return NaN;
    var s = String(v).trim();
    var m = s.match(/(\d{4})/);
    var n = m ? Number(m[1]) : Number(s);
    return isFinite(n) ? n : NaN;
  }
  var yearNum = parseYearNum_(yearRaw);
  if (!isFinite(yearNum)) return { ok:false, error:'year가 올바르지 않습니다.' };

  try{
    var ss = LEAVE_ss_();

    // 1) Employee name map
    var empName = {};
    (function buildEmpNameMap_(){
      var shE = ss.getSheetByName('Employee');
      if (!shE) return;
      var vr = LEAVE_sheetMatrixBySheet_(shE);
      if (!vr || vr.length < 2) return;
      var h = vr[0].map(function(x){ return String(x||'').trim(); });
      var im = indexMap_(h);
      var cId = im['employee_id'];
      var cNm = im['name'];
      var cDel= im['is_deleted'];
      var cVis= im['is_visible'];
      for (var i=1; i<vr.length; i++){
        var row = vr[i];
        if (!row) continue;
        if (cDel != null){
          var d = String(row[cDel] || '').trim();
          if (d === '1' || d.toLowerCase() === 'true') continue;
        }
        if (cVis != null){
          var v = String(row[cVis] || '').trim();
          if (v === '1' || v.toLowerCase() === 'true') continue;
        }
        var eid = (cId != null) ? String(row[cId]||'').trim() : '';
        if (!eid) continue;
        empName[eid] = (cNm != null) ? String(row[cNm]||'').trim() : '';
      }
    })();

    // 2) Leave_Apply read
    var sh = ss.getSheetByName('Leave_Apply');
    if (!sh) return { ok:true, rows:[] };

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { ok:true, rows:[] };

    var values = sh.getRange(1,1,lastRow,lastCol).getValues();
    var head = (values[0] || []).map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(head);

    function v_(row, key){
      var i = idx[key];
      return (i == null) ? '' : row[i];
    }
    function isDeleted_(row){
      var d = String(v_(row,'is_deleted') || '').trim();
      return (d === '1' || d.toLowerCase() === 'true');
    }
    function yearFromDate_(d){
      // d can be a Date object OR "YYYY-MM-DD" string
      if (Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d.getTime())){
        return d.getFullYear();
      }
      d = String(d || '').trim();
      var m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return NaN;
      return Number(m[1]);
    }

    // ✅ normalize helpers (sheet cell may be Date object)
    function _tz_(){
      try{ return Session.getScriptTimeZone() || 'Asia/Seoul'; }catch(e){ return 'Asia/Seoul'; }
    }
    function fmtTime_(v){
      if (v == null || v === '') return '';
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
        return Utilities.formatDate(v, _tz_(), 'HH:mm');
      }
      var s = String(v).trim();
      if (!s) return '';
      // "HH:MM" or "HH:MM:SS"
      var m = s.match(/^(\d{1,2}):(\d{2})/);
      if (m) return String(m[1]).padStart(2,'0') + ':' + m[2];
      // English Date string -> Date parse
      var d = new Date(s);
      if (!isNaN(d.getTime())){
        return Utilities.formatDate(d, _tz_(), 'HH:mm');
      }
      return s;
    }
    function fmtDate_(v){
      if (v == null || v === '') return '';
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
        return Utilities.formatDate(v, _tz_(), 'yyyy-MM-dd');
      }
      var s = String(v).trim();
      if (!s) return '';
      // "YYYY-MM-DD ..."
      var mi = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (mi) return mi[1] + '-' + mi[2] + '-' + mi[3];
      // "YYYY. M. D"
      var mk = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
      if (mk) return mk[1] + '-' + String(mk[2]).padStart(2,'0') + '-' + String(mk[3]).padStart(2,'0');
      // English Date string -> Date parse
      var d = new Date(s);
      if (!isNaN(d.getTime())){
        return Utilities.formatDate(d, _tz_(), 'yyyy-MM-dd');
      }
      return s;
    }

    var rows = [];
    for (var r=1; r<values.length; r++){
      var row = values[r];
      if (!row || row.length===0) continue;
      if (isDeleted_(row)) continue;

      var dateVal = v_(row,'date');
      // ✅ normalize dateStr to "YYYY-MM-DD" even if sheet cell is a Date object
      var dateStr = '';
      if (Object.prototype.toString.call(dateVal) === '[object Date]' && !isNaN(dateVal.getTime())){
        var yy = dateVal.getFullYear();
        var mm = String(dateVal.getMonth()+1).padStart(2,'0');
        var dd = String(dateVal.getDate()).padStart(2,'0');
        dateStr = yy + '-' + mm + '-' + dd;
      }else{
        dateStr = String(dateVal || '').trim();
      }
      var y = yearFromDate_(dateVal);
      if (!isFinite(y) || y !== yearNum) continue;

      var eid = String(v_(row,'employee_id') || '').trim();
      rows.push({
        leave_apply_id: String(v_(row,'leave_apply_id') || '').trim(),
        employee_id: eid,
        employee_name: empName[eid] || '',
        category: String(v_(row,'category') || '').trim(),
        date: dateStr,
        start_time: fmtTime_(v_(row,'start_time')),
        end_time: fmtTime_(v_(row,'end_time')),
        days: String(v_(row,'days') || '').trim(),
        status: String(v_(row,'status') || '').trim(),
        created_at: fmtDate_(v_(row,'created_at')),
        created_by: String(v_(row,'created_by') || '').trim(),
        applied_at: fmtDate_(v_(row,'applied_at')),
        applied_by: String(v_(row,'applied_by') || '').trim()
      });
    }

    return { ok:true, rows: rows };
  }catch(err){
    return { ok:false, error: (err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ 발생연차(연도) 조회: Leave 시트 unofficial_days 합계
// - 연차 메인페이지 요약카드용
// - is_deleted=1(soft delete) 제외
// =========================================================
function LEAVE_getYearUnofficialDays(payload){
  payload = payload || {};
  try{
    var yearLabel = String(payload.year || '').trim();
    var empId = String(payload.employee_id || '').trim();
    var m = yearLabel.match(/(\d{4})/);
    var yearNum = m ? Number(m[1]) : NaN;
    if (!isFinite(yearNum)) return { ok:true, unofficial_days: 0 };

    var ss = LEAVE_ss_();
    var sh = ss.getSheetByName('Leave');
    if (!sh) return { ok:true, unofficial_days: 0 };

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { ok:true, unofficial_days: 0 };

    var values = sh.getRange(1,1,lastRow,lastCol).getValues();
    var head = (values[0] || []).map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(head);

    var iYear = idx['year'];
    var iEmp  = idx['employee_id'];
    var iUno  = idx['unofficial_days'];
    var iDel  = idx['is_deleted'];

    if (iYear == null || iUno == null) return { ok:true, unofficial_days: 0 };

    var sum = 0;
    for (var r=1; r<values.length; r++){
      var row = values[r];
      if (!row || row.length===0) continue;

      // soft delete 제외
      if (iDel != null){
        var d = String(row[iDel] || '').trim();
        if (d === '1' || d.toLowerCase() === 'true') continue;
      }

      var yv = String(row[iYear] || '').trim();
      var ym = yv.match(/(\d{4})/);
      var y = ym ? Number(ym[1]) : NaN;
      if (!isFinite(y) || y !== yearNum) continue;

      // ✅ 직원 선택 시 해당 직원만
      if (empId && iEmp != null){
        var e = String(row[iEmp] || '').trim();
        if (e !== empId) continue;
      }

      var v = row[iUno];
      var n = (typeof v === 'number') ? v : Number(String(v||'').replace(/[^0-9\.-]/g,''));
      if (!isFinite(n)) n = 0;
      sum += n;
    }

    return { ok:true, unofficial_days: sum };
  }catch(err){
    return { ok:false, error: (err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ Leave(발생연차) 연도별 리스트 조회 (프론트 캐시용)
// - payload: { year: "2025년"|"2025"|2025 }
// - return: { ok:true, rows:[{employee_id, unofficial_days}], total_unofficial_days }
// - is_deleted=1 제외
// =========================================================
function LEAVE_listLeaveGrantsByYear(payload){
  payload = payload || {};
  try{
    var yearLabel = String(payload.year || '').trim();
    var m = yearLabel.match(/(\d{4})/);
    var yearNum = m ? Number(m[1]) : NaN;
    if (!isFinite(yearNum)) return { ok:true, rows:[], total_unofficial_days:0 };

    var ss = LEAVE_ss_();
    var sh = ss.getSheetByName('Leave');
    if (!sh) return { ok:true, rows:[], total_unofficial_days:0 };

    var lr = sh.getLastRow();
    var lc = sh.getLastColumn();
    if (lr < 2) return { ok:true, rows:[], total_unofficial_days:0 };

    var values = sh.getRange(1,1,lr,lc).getValues();
    var head = (values[0] || []).map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(head);

    var iYear = idx['year'];
    var iEmp  = idx['employee_id'];
    var iUno  = idx['unofficial_days'];
    var iDel  = idx['is_deleted'];

    if (iYear == null || iEmp == null || iUno == null) return { ok:true, rows:[], total_unofficial_days:0 };

    var out = [];
    var total = 0;

    for (var r=1; r<values.length; r++){
      var row = values[r];
      if (!row) continue;

      if (iDel != null){
        var d = String(row[iDel] || '').trim();
        if (d === '1' || d.toLowerCase() === 'true') continue;
      }

      var yv = String(row[iYear] || '').trim();
      var ym = yv.match(/(\d{4})/);
      var y = ym ? Number(ym[1]) : NaN;
      if (!isFinite(y) || y !== yearNum) continue;

      var eid = String(row[iEmp] || '').trim();
      if (!eid) continue;

      var v = row[iUno];
      var n = (typeof v === 'number') ? v : Number(String(v||'').replace(/[^0-9\.-]/g,''));
      if (!isFinite(n)) n = 0;

      out.push({ employee_id: eid, unofficial_days: n });
      total += n;
    }

    return { ok:true, rows: out, total_unofficial_days: total };
  }catch(err){
    return { ok:false, error: (err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ 연차 메인 통합 로드
// - 연도 기준으로 직원목록/연차정보/발생연차를 한 번에 조회
// - 기존 3회 호출(직원/연차정보/발생연차)을 1회 호출로 대체하기 위한 API
// =========================================================
function LEAVE_loadMainBundle(payload){
  var __perf = (typeof DB_perfStart_ === 'function')
    ? DB_perfStart_('LEAVE_loadMainBundle')
    : null;
  var __perfMeta = { ok:false, employees:0, leaveApplies:0, grants:0 };
  payload = payload || {};

  function parseYearNum_(v){
    if (v == null) return NaN;
    var s = String(v).trim();
    var m = s.match(/(\d{4})/);
    var n = m ? Number(m[1]) : Number(s);
    return isFinite(n) ? n : NaN;
  }
  function isDeletedValue_(v){
    var d = String(v == null ? '' : v).trim().toLowerCase();
    return (d === '1' || d === 'true');
  }
  function num_(v){
    var n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  function yearFromDate_(d){
    if (Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d.getTime())){
      return d.getFullYear();
    }
    d = String(d || '').trim();
    if (!d) return NaN;
    var m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return Number(m[1]);
    var m2 = d.match(/(\d{4})/);
    return m2 ? Number(m2[1]) : NaN;
  }
  function parseDaysHours_(dv){
    var s = String(dv == null ? '' : dv).trim();
    if (!s) return { d:0, h:0 };
    var md = s.match(/(\d+)\s*일/);
    var mh = s.match(/(\d+)\s*시간/);
    var d = md ? Number(md[1]) : 0;
    var h = mh ? Number(mh[1]) : 0;
    if (!isFinite(d)) d = 0;
    if (!isFinite(h)) h = 0;
    return { d:d, h:h };
  }
  function toMinutes_(d, h){
    d = Number(d || 0); h = Number(h || 0);
    if (!isFinite(d)) d = 0;
    if (!isFinite(h)) h = 0;
    return (d * 8 * 60) + (h * 60);
  }
  function fmtMin_(mins){
    mins = Math.max(0, Math.floor(Number(mins || 0)));
    if (!isFinite(mins)) mins = 0;
    var d = Math.floor(mins / (8*60));
    var rem = mins % (8*60);
    var h = Math.floor(rem / 60);
    if (h >= 8){
      d += Math.floor(h / 8);
      h = h % 8;
    }
    var txt = '';
    if (d > 0 && h > 0) txt = d + '일 ' + h + '시간';
    else if (d > 0 && h === 0) txt = d + '일';
    else if (d === 0 && h > 0) txt = h + '시간';
    else txt = '0일';
    return { d:d, h:h, txt:txt };
  }
  function tz_(){
    try{ return Session.getScriptTimeZone() || 'Asia/Seoul'; }catch(e){ return 'Asia/Seoul'; }
  }
  function fmtTime_(v){
    if (v == null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
      return Utilities.formatDate(v, tz_(), 'HH:mm');
    }
    var s = String(v).trim();
    if (!s) return '';
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) return String(m[1]).padStart(2,'0') + ':' + m[2];
    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz_(), 'HH:mm');
    return s;
  }
  function fmtDate_(v){
    if (v == null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
      return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
    }
    var s = String(v).trim();
    if (!s) return '';
    var mi = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mi) return mi[1] + '-' + mi[2] + '-' + mi[3];
    var mk = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
    if (mk) return mk[1] + '-' + String(mk[2]).padStart(2,'0') + '-' + String(mk[3]).padStart(2,'0');
    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
    return s;
  }

  var yearNum = parseYearNum_(payload.year);
  if (!isFinite(yearNum)) return { ok:false, error:'year가 올바르지 않습니다.' };

  try{
    var ss = LEAVE_ss_();

    var employeeT = LEAVE_sheetValues_(ss, 'Employee');
    var leaveT = LEAVE_sheetValues_(ss, 'Leave');
    var applyT = LEAVE_sheetValues_(ss, 'Leave_Apply');

    var empMap = indexMap_(employeeT.header || []);
    var leaveMap = indexMap_(leaveT.header || []);
    var applyMap = indexMap_(applyT.header || []);

    // Employee name map (삭제/숨김 제외)
    var empName = {};
    (employeeT.rows || []).forEach(function(row){
      if (!row) return;
      var cDel = empMap['is_deleted'];
      var cVis = empMap['is_visible'];
      if (cDel != null && isDeletedValue_(row[cDel])) return;
      if (cVis != null && isDeletedValue_(row[cVis])) return;
      var cId = empMap['employee_id'];
      if (cId == null) return;
      var eid = String(row[cId] || '').trim();
      if (!eid) return;
      var cNm = empMap['name'];
      empName[eid] = (cNm != null) ? String(row[cNm] || '').trim() : '';
    });

    // Leave: 연도별 발생연차
    var iYear = leaveMap['year'];
    var iEmp = leaveMap['employee_id'];
    var iUno = leaveMap['unofficial_days'];
    var iDel = leaveMap['is_deleted'];

    var grantMap = {};   // eid -> unofficial_days
    var grantRows = [];  // [{employee_id, unofficial_days}]
    var grantTotal = 0;

    if (iYear != null && iEmp != null && iUno != null){
      (leaveT.rows || []).forEach(function(row){
        if (!row) return;
        if (iDel != null && isDeletedValue_(row[iDel])) return;

        var yRaw = String(row[iYear] || '').trim();
        var ym = yRaw.match(/(\d{4})/);
        var y = ym ? Number(ym[1]) : Number(yRaw);
        if (!isFinite(y) || y !== yearNum) return;

        var eid = String(row[iEmp] || '').trim();
        if (!eid) return;

        var n = (typeof row[iUno] === 'number') ? row[iUno] : Number(String(row[iUno] || '').replace(/[^0-9\.-]/g,''));
        if (!isFinite(n)) n = 0;

        grantMap[eid] = n;
      });
    }

    Object.keys(grantMap).forEach(function(eid){
      var n = Number(grantMap[eid] || 0) || 0;
      grantRows.push({ employee_id: eid, unofficial_days: n });
      grantTotal += n;
    });

    // Leave_Apply: 연차정보 rows + 승인 사용분 minutes
    var usedMin = {}; // eid -> minutes(승인분)
    var leaveApplies = [];

    var aDel = applyMap['is_deleted'];
    var aId = applyMap['leave_apply_id'];
    var aEmp = applyMap['employee_id'];
    var aCat = applyMap['category'];
    var aDate = applyMap['date'];
    var aSt = applyMap['status'];
    var aDays = applyMap['days'];
    var aStt = applyMap['start_time'];
    var aEnd = applyMap['end_time'];
    var aCrAt = applyMap['created_at'];
    var aCrBy = applyMap['created_by'];
    var aApAt = applyMap['applied_at'];
    var aApBy = applyMap['applied_by'];

    (applyT.rows || []).forEach(function(row){
      if (!row) return;
      if (aDel != null && isDeletedValue_(row[aDel])) return;

      var rawDate = (aDate != null) ? row[aDate] : '';
      var y = yearFromDate_(rawDate);
      if (!isFinite(y) || y !== yearNum) return;

      var eid = (aEmp != null) ? String(row[aEmp] || '').trim() : '';
      if (!eid) return;

      var status = (aSt != null) ? String(row[aSt] || '').trim() : '';
      var daysTxt = (aDays != null) ? String(row[aDays] || '').trim() : '';

      leaveApplies.push({
        leave_apply_id: (aId != null) ? String(row[aId] || '').trim() : '',
        employee_id: eid,
        employee_name: empName[eid] || '',
        category: (aCat != null) ? String(row[aCat] || '').trim() : '',
        date: fmtDate_(rawDate),
        start_time: (aStt != null) ? fmtTime_(row[aStt]) : '',
        end_time: (aEnd != null) ? fmtTime_(row[aEnd]) : '',
        days: daysTxt,
        status: status,
        created_at: (aCrAt != null) ? fmtDate_(row[aCrAt]) : '',
        created_by: (aCrBy != null) ? String(row[aCrBy] || '').trim() : '',
        applied_at: (aApAt != null) ? fmtDate_(row[aApAt]) : '',
        applied_by: (aApBy != null) ? String(row[aApBy] || '').trim() : ''
      });

      if (status === '승인' && Object.prototype.hasOwnProperty.call(grantMap, eid)){
        var dh = parseDaysHours_(daysTxt);
        usedMin[eid] = (usedMin[eid] || 0) + toMinutes_(dh.d, dh.h);
      }
    });

    // 직원 목록(부여/사용/잔여)
    var employees = Object.keys(grantMap).map(function(eid){
      var grantDays = Number(grantMap[eid] || 0);
      if (!isFinite(grantDays)) grantDays = 0;

      var grantM = grantDays * 8 * 60;
      var usedM = Number(usedMin[eid] || 0);
      if (!isFinite(usedM)) usedM = 0;
      var remainM = grantM - usedM;
      if (remainM < 0) remainM = 0;

      var usedObj = fmtMin_(usedM);
      var remObj = fmtMin_(remainM);

      return {
        employee_id: eid,
        name: empName[eid] || '',
        grant_days: grantDays,
        grant_txt: grantDays + '일',
        used_days: usedObj.d,
        used_hours: usedObj.h,
        used_txt: usedObj.txt,
        remain_days: remObj.d,
        remain_hours: remObj.h,
        remain_txt: remObj.txt
      };
    });

    employees.sort(function(a,b){
      return String(a.employee_id || '').localeCompare(String(b.employee_id || ''), 'ko', { numeric:true });
    });

    var out = {
      ok:true,
      employees: employees,
      leaveApplies: leaveApplies,
      grants: {
        rows: grantRows,
        total_unofficial_days: grantTotal
      }
    };
    __perfMeta.ok = true;
    __perfMeta.employees = employees.length;
    __perfMeta.leaveApplies = leaveApplies.length;
    __perfMeta.grants = grantRows.length;
    return out;
  }catch(err){
    return { ok:false, error:(err && err.message) ? err.message : String(err) };
  }finally{
    if (__perf && typeof DB_perfEnd_ === 'function') DB_perfEnd_(__perf, __perfMeta);
  }
}

// =========================================================
// ✅ 연차신청 저장 (Leave_Apply 시트 append)
// - leave_apply_id: UUID
// - employee_id/category/date/start_time/end_time/days: payload
// - status: "신청"
// - created_at/by: 연차설정과 동일 actorLabel
// - applied_at/by: 빈값 (승인 처리 시 사용)
// - is_deleted: 0
// =========================================================
function LEAVE_applyLeave(payload){
  payload = payload || {};
  var employee_id = String(payload.employee_id || '').trim();
  var category    = String(payload.category || '').trim();  // "일" | "시간"
  var date        = String(payload.date || '').trim();      // "yyyy-mm-dd"
  var start_time  = String(payload.start_time || '').trim();// "HH:MM" or ""
  var end_time    = String(payload.end_time || '').trim();  // "HH:MM" or ""
  var days        = String(payload.days || '').trim();      // "0일" | "n시간" | "1일"

  if (!employee_id) return { ok:false, error:'employee_id가 없습니다.' };
  if (!category)    return { ok:false, error:'category가 없습니다.' };
  if (!date)        return { ok:false, error:'date가 없습니다.' };
  if (!days)        return { ok:false, error:'days가 없습니다.' };

  try{
    LEAVE_assertPerm_('page:leave:view');

    var notifyCtx = null;
    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      var ss = LEAVE_ss_();
      var sh = ss.getSheetByName('Leave_Apply');
      if (!sh) sh = ss.insertSheet('Leave_Apply');

    function _normDateKey_(v){
      if (v == null || v === '') return '';
      var tz = 'Asia/Seoul';
      try{ tz = Session.getScriptTimeZone() || tz; }catch(e){}
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
        return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      }
      var s = String(v).trim();
      if (!s) return '';
      var m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) return m[1] + '-' + m[2] + '-' + m[3];
      m = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
      if (m) return m[1] + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[3]).padStart(2,'0');
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      return s;
    }
    function _isDeleted_(v){
      var d = String(v == null ? '' : v).trim().toLowerCase();
      return (d === '1' || d === 'true');
    }

    // ✅ actorLabel (연차설정과 동일)
    var actorObj = null;
    var actorLabel = '';
    try{ if (typeof DB_getActor_ === 'function') actorObj = DB_getActor_(); }catch(e){}
    try{ if (actorObj && typeof DB_actorLabel_ === 'function') actorLabel = DB_actorLabel_(actorObj); }catch(e){}
    if (!actorLabel){
      try{ actorLabel = String(Session.getActiveUser().getEmail() || ''); }catch(e){}
    }
    var now = new Date();

    var HEAD = [
      'leave_apply_id',
      'employee_id',
      'category',
      'date',
      'start_time',
      'end_time',
      'days',
      'status',
      'created_at',
      'created_by',
      'applied_at',
      'applied_by',
      'is_deleted'
    ];

    // 헤더 보장(없으면 생성 / 누락 컬럼은 뒤에 추가)
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1){
      sh.getRange(1,1,1,HEAD.length).setValues([HEAD]);
      lastRow = 1;
      lastCol = HEAD.length;
    }else{
      var h = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(v){ return String(v||'').trim(); });
      var exist = {};
      h.forEach(function(k){ if (k) exist[k]=true; });
      var add = HEAD.filter(function(k){ return !exist[k]; });
      if (add.length){
        sh.getRange(1,lastCol+1,1,add.length).setValues([add]);
        lastCol += add.length;
      }
    }

    // 인덱스 맵
    var header = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(header);
    function col(key){ return idx[key]; }

    // ✅ 동일자 중복 신청 방지 (삭제되지 않은 신청/승인/미승인 데이터가 있으면 차단)
    var cEmp = col('employee_id');
    var cDate = col('date');
    var cSt = col('status');
    var cDel = col('is_deleted');
    if (cEmp == null || cDate == null || cSt == null){
      return { ok:false, error:'Leave_Apply 시트 헤더(employee_id/date/status)가 필요합니다.' };
    }
    var newDateKey = _normDateKey_(date);
    var lrChk = sh.getLastRow();
    if (lrChk >= 2){
      var rowsChk = sh.getRange(2, 1, lrChk - 1, sh.getLastColumn()).getValues();
      for (var r=0; r<rowsChk.length; r++){
        var rr = rowsChk[r] || [];
        if (String(rr[cEmp] || '').trim() !== employee_id) continue;
        if (_normDateKey_(rr[cDate]) !== newDateKey) continue;
        if (cDel != null && _isDeleted_(rr[cDel])) continue;
        var st = String(rr[cSt] || '').trim();
        if (st === '신청' || st === '승인' || st === '미승인'){
          return { ok:false, error:'동일 일자에 이미 연차 신청/처리 내역이 있습니다.' };
        }
      }
    }

    // row 생성
    var row = new Array(sh.getLastColumn()).fill('');
    row[col('leave_apply_id')] = Utilities.getUuid();
    row[col('employee_id')]    = employee_id;
    row[col('category')]       = category;
    row[col('date')]           = date;
    row[col('start_time')]     = start_time;
    row[col('end_time')]       = end_time;
    row[col('days')]           = days;
    row[col('status')]         = '신청';
    row[col('created_at')]     = now;
    row[col('created_by')]     = actorLabel;
    row[col('applied_at')]     = '';        // 승인 시 채움
    row[col('applied_by')]     = '';        // 승인 시 채움
    row[col('is_deleted')]     = 0;

      sh.appendRow(row);
      if (typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Leave_Apply');
      notifyCtx = {
        employee_id: employee_id,
        category: category,
        date: date,
        start_time: start_time,
        end_time: end_time,
        days: days,
        created_by: actorLabel,
        created_at: now
      };
    } finally {
      lock.releaseLock();
    }
    var mailResult = { ok:false, skipped:true, reason:'not_attempted' };
    try{
      notifyCtx.employee_name = LEAVE_lookupEmployeeName_(employee_id);
      mailResult = LEAVE_sendApplyNoticeMail_(notifyCtx);
      if (!mailResult || mailResult.ok !== true){
        try{ console.warn('[LEAVE_applyLeave] mail notify skipped: ' + JSON.stringify(mailResult || {})); }catch(e){}
      }
    }catch(mailErr){
      mailResult = { ok:false, error:(mailErr && mailErr.message) ? mailErr.message : String(mailErr) };
      try{ console.error('[LEAVE_applyLeave] mail notify failed: ' + (mailErr && mailErr.message ? mailErr.message : String(mailErr))); }catch(e){}
    }
    return { ok:true, mail: mailResult };
  }catch(err){
    return { ok:false, error:(err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ 승인관리: 상태 변경(동일 행 업데이트)
// - updates: [{ leave_apply_id, status }]
// - 승인/미승인 => applied_at/by 기록
// - 신청        => applied_at/by 비움
// =========================================================
function LEAVE_updateLeaveApplyStatus(payload){
  payload = payload || {};
  var updates = payload.updates || [];
  if (!Array.isArray(updates) || !updates.length) return { ok:true, updated:0 };

  try{
    LEAVE_assertPerm_('btn:leave:approval');

    var notifyQueue = [];
    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      var ss = LEAVE_ss_();
      var sh = ss.getSheetByName('Leave_Apply');
      if (!sh) return { ok:false, error:'Leave_Apply 시트가 없습니다.' };

    var actorLabel = '';
    try{
      var actorObj = (typeof DB_getActor_ === 'function') ? DB_getActor_() : null;
      actorLabel = (actorObj && typeof DB_actorLabel_ === 'function') ? DB_actorLabel_(actorObj) : '';
    }catch(e){}
    if (!actorLabel){
      try{ actorLabel = String(Session.getActiveUser().getEmail() || ''); }catch(e){}
    }
    var now = new Date();

    var lr = sh.getLastRow();
    var lc = sh.getLastColumn();
    if (lr < 2) return { ok:true, updated:0 };

    var values = sh.getRange(1,1,lr,lc).getValues();
    var head = (values[0] || []).map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(head);

    function col_(k){ return idx[k]; }
    var cId = col_('leave_apply_id');
    var cSt = col_('status');
    var cAt = col_('applied_at');
    var cBy = col_('applied_by');
    var cDel= col_('is_deleted');
    var cEmp= col_('employee_id');
    var cCat= col_('category');
    var cDate= col_('date');
    var cSrt= col_('start_time');
    var cEnd= col_('end_time');
    var cDays= col_('days');
    var cCrBy= col_('created_by');
    var cCrAt= col_('created_at');

    if (cId == null) return { ok:false, error:'leave_apply_id 컬럼이 없습니다.' };
    if (cSt == null) return { ok:false, error:'status 컬럼이 없습니다.' };

    // id -> values row index(1..)
    var map = {};
    for (var r=1; r<values.length; r++){
      var id = String(values[r][cId] || '').trim();
      if (id) map[id] = r;
    }

    var updated = 0;
    updates.forEach(function(u){
      if (!u) return;
      var id = String(u.leave_apply_id || '').trim();
      if (!id) return;
      var rr = map[id];
      if (rr == null) return;

      var row = values[rr];
      if (!row) return;

      // 소프트삭제 행은 무시
      if (cDel != null){
        var d = String(row[cDel] || '').trim().toLowerCase();
        if (d === '1' || d === 'true') return;
      }

      var oldSt = String(row[cSt] || '').trim();
      var st = String(u.status || '').trim() || '신청';
      row[cSt] = st;

      if (st === '승인' || st === '미승인'){
        if (cAt != null) row[cAt] = now;
        if (cBy != null) row[cBy] = actorLabel;
        if (oldSt !== st){
          notifyQueue.push({
            leave_apply_id: id,
            employee_id: (cEmp != null) ? String(row[cEmp] || '').trim() : '',
            category: (cCat != null) ? String(row[cCat] || '').trim() : '',
            date: (cDate != null) ? String(row[cDate] || '').trim() : '',
            start_time: (cSrt != null) ? String(row[cSrt] || '').trim() : '',
            end_time: (cEnd != null) ? String(row[cEnd] || '').trim() : '',
            days: (cDays != null) ? String(row[cDays] || '').trim() : '',
            status: st,
            created_by: (cCrBy != null) ? String(row[cCrBy] || '').trim() : '',
            created_at: (cCrAt != null) ? row[cCrAt] : '',
            applied_by: actorLabel,
            applied_at: now
          });
        }
      }else{
        if (cAt != null) row[cAt] = '';
        if (cBy != null) row[cBy] = '';
      }
      updated++;
    });

    if (updated > 0){
      sh.getRange(2, 1, lr - 1, lc).setValues(values.slice(1));
    }

      if (updated > 0 && typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Leave_Apply');
    } finally {
      lock.releaseLock();
    }

    var mailSummary = { attempted:0, sent:0, skipped:0, failed:0 };
    if (notifyQueue.length){
      var userMaps = LEAVE_getUserEmailMaps_();
      var empEmailMap = LEAVE_getEmployeeEmailMap_();
      for (var i=0; i<notifyQueue.length; i++){
        var n = notifyQueue[i] || {};
        var applicantEmail = LEAVE_resolveEmailByEmpId_(n.employee_id, userMaps, empEmailMap);
        var creatorEmail = LEAVE_resolveCreatorEmail_(n.created_by, userMaps);
        var rec = [];
        if (applicantEmail) rec.push(applicantEmail);
        if (creatorEmail) rec.push(creatorEmail);

        mailSummary.attempted++;
        try{
          var mres = LEAVE_sendStatusNoticeMail_({
            recipients: rec,
            employee_id: n.employee_id,
            category: n.category,
            date: n.date,
            start_time: n.start_time,
            end_time: n.end_time,
            days: n.days,
            status: n.status,
            created_by: n.created_by,
            created_at: n.created_at,
            applied_by: n.applied_by,
            applied_at: n.applied_at
          });
          if (mres && mres.ok === true) mailSummary.sent += Number(mres.sent || 0);
          else mailSummary.skipped++;
        }catch(mailErr){
          mailSummary.failed++;
          try{ console.error('[LEAVE_updateLeaveApplyStatus] mail notify failed: ' + (mailErr && mailErr.message ? mailErr.message : String(mailErr))); }catch(e){}
        }
      }
    }

    return { ok:true, updated: updated, mail: mailSummary };
  }catch(err){
    return { ok:false, error:(err && err.message) ? err.message : String(err) };
  }
}

// =========================================================
// ✅ 승인관리: 선택삭제(소프트삭제)
// - ids: [leave_apply_id, ...]
// - is_deleted = 1
// =========================================================
function LEAVE_softDeleteLeaveApplies(payload){
  payload = payload || {};
  var ids = payload.ids || [];
  if (!Array.isArray(ids) || !ids.length) return { ok:true, deleted:0 };

  try{
    LEAVE_assertPerm_('btn:leave:approval');

    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      var ss = LEAVE_ss_();
      var sh = ss.getSheetByName('Leave_Apply');
      if (!sh) return { ok:false, error:'Leave_Apply 시트가 없습니다.' };

    var lr = sh.getLastRow();
    var lc = sh.getLastColumn();
    if (lr < 2) return { ok:true, deleted:0 };

    var values = sh.getRange(1,1,lr,lc).getValues();
    var head = (values[0] || []).map(function(v){ return String(v||'').trim(); });
    var idx = indexMap_(head);

    var cId = idx['leave_apply_id'];
    var cDel= idx['is_deleted'];
    if (cId == null) return { ok:false, error:'leave_apply_id 컬럼이 없습니다.' };

    // is_deleted 없으면 생성
    if (cDel == null){
      sh.getRange(1, lc+1, 1, 1).setValues([['is_deleted']]);
      cDel = lc; // 0-index
      lc += 1;
      head.push('is_deleted');
      values[0][cDel] = 'is_deleted';
      for (var r0=1; r0<values.length; r0++){
        values[r0][cDel] = values[r0][cDel] || '';
      }
    }

    var map = {};
    for (var r=1; r<values.length; r++){
      var id = String(values[r][cId] || '').trim();
      if (id) map[id] = r;
    }

    var deleted = 0;
    ids.forEach(function(id){
      id = String(id || '').trim();
      if (!id) return;
      var rr = map[id];
      if (rr == null) return;
      var row = values[rr];
      if (!row) return;
      var cur = String(row[cDel] || '').trim().toLowerCase();
      if (cur === '1' || cur === 'true') return;
      row[cDel] = 1;
      deleted++;
    });

    if (deleted > 0){
      sh.getRange(2, 1, lr - 1, lc).setValues(values.slice(1));
    }

      if (deleted > 0 && typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Leave_Apply');
      return { ok:true, deleted: deleted };
    } finally {
      lock.releaseLock();
    }
  }catch(err){
    return { ok:false, error:(err && err.message) ? err.message : String(err) };
  }
}

