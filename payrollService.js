/** payrollService.gs
 * 근태/급여(예산/실지급) 계산용 서비스
 * - DB에는 '기준'과 '실지급'만 저장
 * - 계산 결과는 Employee 데이터 + 기준 테이블을 조합해 산출
 */

// =========================================================
// ✅ PAYROLL 런타임 캐시 (요청 단위)
// - computeRange()는 한 번의 서버 호출에서 월별 computeMonthly()를 여러 번 돌림
// - 매월 동일 시트를 getValues로 다시 읽는 것이 병목이므로
//   "요청 단위"로만 캐시해서 월 루프 동안 재사용한다.
// - 데이터 최신성 보장을 위해 computeRange 시작 시 캐시 초기화.
// =========================================================
var PAYROLL__DBQ_CACHE = {};       // key: sheet|field|value -> rows[]
var PAYROLL__SHEETOBJ_CACHE = {};  // key: sheetName -> objectRows[]
var PAYROLL__EMP_CACHE = null;     // Payroll 대상 직원 list

function PAYROLL_resetRuntimeCaches_(){
  PAYROLL__DBQ_CACHE = {};
  PAYROLL__SHEETOBJ_CACHE = {};
  PAYROLL__EMP_CACHE = null;
}

// =========================================================
// ✅ Payment 저장 후 DBQ 캐시 무효화(요청 단위 캐시)
// - computeMonthly()는 PAYROLL_DB_queryByFieldCached_ 를 사용하므로
//   Payment 저장 직후 year 쿼리 캐시만 지워주면 최신이 즉시 반영된다.
// =========================================================
function PAYROLL_invalidatePaymentYearCache_(year4){
  var y = String(year4 || '').trim();
  if (!y) return;
  var k1 = 'Payment|year|' + y;
  var k2 = 'Payment|year|' + (y + '년');
  Object.keys(PAYROLL__DBQ_CACHE || {}).forEach(function(k){
    if (k === k1 || k === k2) delete PAYROLL__DBQ_CACHE[k];
  });
}

// =========================================================
// ✅ 공통: is_deleted 정규화 + Actor Label(사번 성명) 만들기
// =========================================================
function PAYROLL_normNotDeletedValue_(){ return '0'; }
function PAYROLL_normDeletedValue_(){ return '1'; }

function PAYROLL_isDeletedValue_(v){
  // ✅ 1/0, '1'/'0', TRUE/FALSE 모두 흡수
  if (v === true) return true;
  if (v === false || v == null || v === '') return false;
  if (v === 1) return true;
  if (v === 0) return false;
  var s = String(v).trim().toLowerCase();
  return (s === '1' || s === 'true' || s === 'y' || s === 'yes');
}

function PAYROLL_actorEmail_(){
  var email = '';
  try { email = (typeof getActorEmail_ === 'function') ? (getActorEmail_() || '') : ''; } catch(e){}
  if (!email){
    try { email = Session.getActiveUser().getEmail() || ''; } catch(e){}
  }
  return String(email || '').trim();
}

function PAYROLL_safeReadSheetObjects_(sheetName){
  // 프로젝트/소속인력 쪽에 read 함수가 이미 있으면 그걸 쓰고,
  // 없으면 DB_readSheetObjects_ / DB_sheet_ 기반으로 최대한 안전하게 읽는다.
  try {
    if (typeof PAYROLL_readSheetObjects_ === 'function') {
      return PAYROLL_readSheetObjects_(sheetName) || [];
    }
  } catch(e){}

  try {
    if (typeof DB_readSheetObjects_ === 'function') {
      return DB_readSheetObjects_(sheetName) || [];
    }
  } catch(e){}

  try {
    if (typeof DB_readRows_ === 'function') {
      var t = DB_readRows_(sheetName);
      return (t && t.rows) ? t.rows : [];
    }
  } catch(e){}

  // 최후의 fallback: 시트 직접 읽기(헤더 기반)
  try {
    var sh = DB_sheet_(sheetName);
    var lr = sh.getLastRow(), lc = sh.getLastColumn();
    if (lr < 2 || lc < 1) return [];
    var header = sh.getRange(1,1,1,lc).getValues()[0].map(function(v){ return String(v||'').trim(); });
    var vals = sh.getRange(2,1,lr-1,lc).getValues();
    var out = [];
    for (var r=0; r<vals.length; r++){
      var obj = {};
      for (var c=0; c<header.length; c++){
        var k = header[c];
        if (!k) continue;
        obj[k] = vals[r][c];
      }
      out.push(obj);
    }
    return out;
  } catch(e){
    return [];
  }
}

function PAYROLL_actorLabel_(){
  // ✅ 공용 패턴 재사용: "emp_id emp_name"
  try{
    if (typeof DB_getActor_ === 'function' && typeof DB_actorLabel_ === 'function'){
      return DB_actorLabel_(DB_getActor_()) || '';
    }
  }catch(e){}
  // fallback: email
  try{
    return String(getActorEmail_ ? getActorEmail_() : Session.getActiveUser().getEmail() || '').trim();
  }catch(e){}
  return '';
}

function PAYROLL_DB_queryByFieldCached_(sheetName, field, value){
  var k = String(sheetName||'') + '|' + String(field||'') + '|' + String(value==null?'':value).trim();
  if (Object.prototype.hasOwnProperty.call(PAYROLL__DBQ_CACHE, k)) return PAYROLL__DBQ_CACHE[k];
  var res = DB_queryByField_(sheetName, field, value) || [];
  PAYROLL__DBQ_CACHE[k] = res;
  return res;
}


/**
 * BaseSalary_Std.year 에 있는 연도(중복 제거) 목록 반환
 * - year 값은 "2026년" 같이 단위가 붙어있을 수 있음
 * - 반환: [{value: "2026", label:"2026년"}, ...] (오름차순)
 */
function PAYROLL_listBaseSalaryYears(){
  // ✅ 연도목록은 UI 진입 시점에 "항상 최신"이 중요 + 과거 에러 캐시 복구 목적
  // (패치1을 적용했어도, 확실하게 최신을 원하면 force 사용)
  var rows = PAYROLL_readSheetObjects_('BaseSalary_Std', { force:true }) || [];
  var map = {};
  rows.forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var raw = String(r.year == null ? '' : r.year).trim();
    if (!raw) return;
    var y = raw.replace(/[^0-9]/g,''); // "2026년" -> "2026"
    if (!/^\d{4}$/.test(y)) return;
    map[y] = true;
  });
  var ys = Object.keys(map).sort(); // 문자열 정렬(YYYY는 OK)
  return ys.map(function(y){
    return { value: String(y), label: String(y) + '년' };
  });
}

// =========================================================
// 급여기준(연도별) - year 정규화 유틸
// =========================================================
function PAYROLL_normYear_(v){
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  s = s.replace(/[^0-9]/g,''); // "2025년" -> "2025"
  return /^\d{4}$/.test(s) ? s : '';
}

// =========================================================
// ✅ [PATCH A - 선택복사] 연도 프리필(직전년도 클론) 정책
// - 자동복사 X, "버튼 클릭" 시에만 prefill 수행
// - 허용범위:
//   * 요청연도 == 올해  && 현재월 <= 9  → from = (요청연도-1)
//   * 요청연도 == 내년 && 현재월 >= 10 → from = (요청연도-1)
// - 과거연도(예: 2025)가 비어도 2024를 복사하지 않도록 "올해/내년만" 허용
// - from은 항상 (요청연도-1) 고정 (연쇄복사 방지)
// =========================================================
function PAYROLL_getPrefillFromYear_(targetYear){
  var y = Number(targetYear || 0) || 0;
  if (!y) return '';
  var now = new Date();
  var cy = now.getFullYear();
  var cm = now.getMonth() + 1; // 1~12
  if (y === cy && cm <= 9) return String(y - 1);
  if (y === (cy + 1) && cm >= 10) return String(y - 1);
  return '';
}

function PAYROLL_hasAnyStdRowsForYear_(y){
  // 4개 기준 테이블 중 "하나라도" 있으면 true (삭제 제외)
  function count_(sheetName){
    var rows = PAYROLL_readSheetObjects_(sheetName) || [];
    var n = 0;
    rows.forEach(function(r){
      if (!r) return;
      if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
      if (PAYROLL_normYear_(r.year) === y) n++;
    });
    return n;
  }
  return (
    count_('BaseSalary_Std') > 0 ||
    count_('BaseSalary_Std_Exc') > 0 ||
    count_('Alw_Std') > 0 ||
    count_('Socialins_Std') > 0
  );
}

function PAYROLL_cloneStdRows_(sheetName, fromYear, toYear){
  // fromYear 데이터(삭제 제외)를 가져와 toYear로 "UI용 클론" 반환 (DB 저장 아님)
  // - *_id, created_*, updated_* 제거
  // - is_deleted는 '0'으로 (있다면)
  // - year는 "YYYY년"으로 세팅
  var rows = PAYROLL_readSheetObjects_(sheetName) || [];
  var out = [];
  rows.forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    if (PAYROLL_normYear_(r.year) !== fromYear) return;
    var o = {};
    Object.keys(r).forEach(function(k){
      if (!k) return;
      // 시스템/감사 필드 제거
      if (k === 'created_at' || k === 'created_by' || k === 'updated_at' || k === 'updated_by') return;
      if (k === 'is_deleted') return;
      // ✅ id 제거: "PK성격"만 제거하고, employee_id(외래키/자연키)는 유지해야 함
      // - 기존 /_id$/ 로 employee_id 까지 날아가던 버그 수정
      if (/_id$/i.test(k) && String(k).toLowerCase() !== 'employee_id'){
        // PK로 보이는 것만 제거 (시트별 접두어 기반)
        var kk = String(k).toLowerCase();
        var isPkLike =
          (sheetName === 'BaseSalary_Std'     || sheetName === 'BaseSalary_Std_Exc') ? (/^(basesal|base_salary|basesalary)/.test(kk)) :
          (sheetName === 'Alw_Std')           ? (/^(alw|allowance)/.test(kk)) :
          (sheetName === 'Socialins_Std')     ? (/^(socialins|social_ins)/.test(kk)) :
          true;
        if (isPkLike) return;
      }
      o[k] = r[k];
    });
    o.year = String(toYear) + '년';
    // (있다면) 삭제 플래그는 "미삭제"
    o.is_deleted = PAYROLL_normNotDeletedValue_();
    out.push(o);
  });
  return out;
}

// =========================================================
// ✅ year/month 입력값 정규화(프론트에서 '2026년', '1월' 형태로 와도 처리)
// =========================================================
function PAYROLL_normYearNumber_(v){
  var y = PAYROLL_normYear_(v); // "2026년" -> "2026"
  return y ? (Number(y) || 0) : 0;
}

function PAYROLL_normMonthNumber_(v){
  if (v == null || v === '') return 0;
  // Date 객체가 오면 month 추출(1~12)
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
    return v.getMonth() + 1;
  }
  var s = String(v).trim();
  if (!s) return 0;
  var m = s.replace(/[^0-9]/g,''); // "01월" -> "01"
  var n = Number(m) || 0;
  if (n < 1 || n > 12) return 0;
  return n;
}

function PAYROLL_isDeleted_(row){
  if (!row) return true;
  return PAYROLL_isDeletedValue_(row.is_deleted);
}

// =========================================================
// 급여기준(연도별) 조회 / 저장
// - sheets:
//   BaseSalary_Std, BaseSalary_Std_Exc, Alw_Std, Socialins_Std
// =========================================================

function PAYROLL_getSalaryStd(payload){
  payload = payload || {};
  var y = PAYROLL_normYear_(payload.year);
  if (!y) throw new Error('year 형식 오류(YYYY): ' + payload.year);

  function pick_(sheetName){
    var rows = PAYROLL_readSheetObjects_(sheetName) || [];
    return rows.filter(function(r){
      if (!r) return false;
      if (PAYROLL_isDeleted_(r)) return false;
      return PAYROLL_normYear_(r.year) === y;
    });
  }

  var baseStd = pick_('BaseSalary_Std');
  var baseExc = pick_('BaseSalary_Std_Exc');
  var alwStd  = pick_('Alw_Std');
  var insStd  = pick_('Socialins_Std');

  var out = {
    ok: true,
    year: y,
    baseStd: baseStd,
    baseExc: baseExc,
    alwStd:  alwStd,
    insStd:  insStd,

    // ✅ 선택복사 메타
    // - 이제 "대상연도 비었는지"와 무관하게, 직전년도 데이터가 있으면 available=true
    prefill: { available:false, from:'' },
    prefilled_from: ''
  };

  // ✅ 정책 제거: 무조건 직전년도
  var fromY = String((Number(y) || 0) - 1);
  if (/^\d{4}$/.test(fromY)) {
    var hasFrom = PAYROLL_hasAnyStdRowsForYear_(fromY);
    out.prefill.available = !!hasFrom;
    out.prefill.from = hasFrom ? fromY : '';

    // ✅ 버튼 눌렀을 때는 "무조건 직전년도 복사 결과로 덮어쓰기"
    if (payload.prefill === true) {
      if (!hasFrom) throw new Error(fromY + '년 기준 데이터가 없어 복사할 수 없습니다.');

      out.baseStd = PAYROLL_cloneStdRows_('BaseSalary_Std', fromY, y);
      out.baseExc = PAYROLL_cloneStdRows_('BaseSalary_Std_Exc', fromY, y);
      out.alwStd  = PAYROLL_cloneStdRows_('Alw_Std', fromY, y);
      out.insStd  = PAYROLL_cloneStdRows_('Socialins_Std', fromY, y);

      out.prefilled_from = fromY;
    }
  }

  if (typeof _jsonSafeKst_ === 'function') return _jsonSafeKst_(out);
  return JSON.parse(JSON.stringify(out));
}

function PAYROLL_saveSalaryStd(payload){
  payload = payload || {};
  var y = PAYROLL_normYear_(payload.year);
  if (!y) throw new Error('year 형식 오류(YYYY): ' + payload.year);

  if (typeof DB_assertPerm_ === 'function') DB_assertPerm_('btn:payroll:stdset');

  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try{
    // ✅ 작성자: 이메일이 아니라 "사번 성명"
    var actorLabel = PAYROLL_actorLabel_();

    PAYROLL_syncYearRows_('BaseSalary_Std',     y, payload.baseStd || [], actorLabel);
    PAYROLL_syncYearRows_('BaseSalary_Std_Exc', y, payload.baseExc || [], actorLabel);
    PAYROLL_syncYearRows_('Alw_Std',            y, payload.alwStd  || [], actorLabel);
    PAYROLL_syncYearRows_('Socialins_Std',      y, payload.insStd  || [], actorLabel);

    if (typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('BaseSalary_Std');
    return { ok:true, year:y };
  } finally {
    lock.releaseLock();
  }
}

// =========================================================
// ✅ Payment(실지급) - 월 단위 조회/저장 API
// - year/month 입력: "2026", "2026년", 1, "1월" 등 흡수
// - 저장: upsert(기본) + _mode='delete' 또는 is_deleted=true 면 soft delete
// - 저장 후 Payment year 캐시 무효화 → computeMonthly 즉시 최신 반영
// =========================================================

function PAYMENT_getMonth(payload){
  payload = payload || {};
  var year = PAYROLL_normYearNumber_(payload.year);
  var month = PAYROLL_normMonthNumber_(payload.month);
  if (!year || !month) throw new Error('Invalid year/month');

  var yKey1 = String(year);
  var yKey2 = String(year) + '년';

  // computeMonthly와 동일: year는 2가지 형태 모두 조회
  var a = PAYROLL_DB_queryByFieldCached_('Payment', 'year', yKey1) || [];
  var b = PAYROLL_DB_queryByFieldCached_('Payment', 'year', yKey2) || [];
  var rows = a.concat(b).filter(function(r){
    if (!r) return false;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return false;
    var rm = String(r.month || '').replace(/[^0-9]/g,'');
    var m = Number(rm || 0) || 0;
    return (m === month);
  });

  var out = { ok:true, year:year, month:month, rows:rows };
  if (typeof _jsonSafeKst_ === 'function') return _jsonSafeKst_(out);
  return JSON.parse(JSON.stringify(out));
}

function PAYMENT_saveMonth(payload){
  payload = payload || {};
  var year = PAYROLL_normYearNumber_(payload.year);
  var month = PAYROLL_normMonthNumber_(payload.month);
  if (!year || !month) throw new Error('Invalid year/month');

  if (typeof DB_assertPerm_ === 'function') DB_assertPerm_('btn:payroll:paymentset');

  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try{
    var rows = Array.isArray(payload.rows) ? payload.rows : [];
    var actorLabel = PAYROLL_actorLabel_();
    var now = new Date();

  var sh = DB_sheet_('Payment');
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new Error('Payment 시트 컬럼이 없습니다.');

  var header = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(v){ return String(v||'').trim(); });
  var map = {};
  header.forEach(function(k,i){ if (k) map[k] = i; });

  // 필수 컬럼
  if (map.year == null) throw new Error('Payment 시트에 year 컬럼이 없습니다.');
  if (map.month == null) throw new Error('Payment 시트에 month 컬럼이 없습니다.');
  if (map.employee_id == null) throw new Error('Payment 시트에 employee_id 컬럼이 없습니다.');

  // 시스템/감사 컬럼(있으면 반영)
  var delCol = (map.is_deleted != null) ? (map.is_deleted + 1) : 0;
  var uAtCol = (map.updated_at != null) ? (map.updated_at + 1) : 0;
  var uByCol = (map.updated_by != null) ? (map.updated_by + 1) : 0;
  var cAtCol = (map.created_at != null) ? (map.created_at + 1) : 0;
  var cByCol = (map.created_by != null) ? (map.created_by + 1) : 0;

  // PK 후보(있으면 자동증가) — employee_id는 제외
  var idKey = null, idCol = 0;
  (function pickIdKey_(){
    var candidates = header.filter(function(k){ return k && /_id$/i.test(k); });
    if (!candidates.length) return;
    // payment_id 우선
    for (var i=0; i<candidates.length; i++){
      if (String(candidates[i]).toLowerCase() === 'payment_id'){
        idKey = candidates[i];
        break;
      }
    }
    // 없으면 employee_id 제외 첫 _id
    if (!idKey){
      for (var j=0; j<candidates.length; j++){
        if (String(candidates[j]).toLowerCase() === 'employee_id') continue;
        idKey = candidates[j];
        break;
      }
    }
    if (idKey && map[idKey] != null) idCol = map[idKey] + 1;
  })();

  // =========================================================
  // [PATCH-ID] 서버 전용 PK: payload의 payment_id(=idKey)는 무시
  // =========================================================
  var __IDKEY_LOWER__ = idKey ? String(idKey).toLowerCase() : '';

  // =========================================================
  // [PATCH-NUM] 숫자필드: 콤마/공백 제거 후 number로 저장
  // - 빈값('' / null / NBSP)은 그대로 '' 유지
  // =========================================================
  var __NBSP__ = '\u00A0';
  var __NUM_FIELDS__ = {
    salary: true,
    alw_overtime: true,
    socialins_np: true,
    socialins_hi: true,
    socialins_ei: true,
    socialins_ii: true,
    severance: true
  };

  function __normNumForCell__(v){
    if (v === __NBSP__ || v === '' || v == null) return '';
    if (typeof v === 'number') return (isFinite(v) ? v : '');
    var s = String(v).trim();
    if (!s) return '';
    // "1,234" / " 1,234 " / "1 234" 등 처리
    s = s.replace(/,/g, '').replace(/\s+/g, '');
    // 숫자/부호/소수점만 남기기(기타 문자 제거)
    s = s.replace(/[^0-9.\-]/g, '');
    if (!s || s === '-' || s === '.' || s === '-.') return '';
    var n = Number(s);
    return (isFinite(n) ? n : '');
  }

  // 기존 데이터 1회 로드(행 인덱스 필요)
  var vals = [];
  if (lastRow >= 2){
    vals = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  }

  function normYear4_(v){
    return PAYROLL_normYear_(v) || '';
  }
  function normMonthN_(v){
    return PAYROLL_normMonthNumber_(v) || 0;
  }

  // 기존행 인덱스: (year, month, employee_id) → row idx
  var existingByEmp = {}; // eid -> { idx, row }
  for (var r=0; r<vals.length; r++){
    var row = vals[r];
    var y = normYear4_(row[map.year]);
    var m = normMonthN_(row[map.month]);
    if (Number(y||0) !== year) continue;
    if (m !== month) continue;

    var eid = String(row[map.employee_id] || '').trim();
    if (!eid) continue;
    existingByEmp[eid] = { idx:r, row:row };
  }

  // next id 계산
  var nextId = 1;
  if (idCol && lastRow >= 2){
    var ids = sh.getRange(2, idCol, lastRow-1, 1).getValues();
    var maxId = 0;
    for (var ii=0; ii<ids.length; ii++){
      var n = Number(ids[ii][0] || 0) || 0;
      if (n > maxId) maxId = n;
    }
    nextId = maxId + 1;
  }

  // 입력 rows를 eid 기준으로 정리(중복 마지막 승)
  var incomingByEmp = {};
  rows.forEach(function(o){
    o = o || {};
    var eid = String(o.employee_id || '').trim();
    if (!eid) return;
    incomingByEmp[eid] = o;
  });

  function isDeleteMode_(o){
    if (!o) return false;
    var m = String(o._mode || '').trim().toLowerCase();
    if (m === 'delete' || m === 'del' || m === 'remove') return true;
    if (PAYROLL_isDeletedValue_(o.is_deleted)) return true;
    return false;
  }

  function normalizeForWrite_(o){
    // ✅ Payment도 급여기준과 동일: 시트에는 "YYYY년", "M월"로 저장
    var out = {};
    Object.keys(o||{}).forEach(function(k){
      if (!k) return;
      var kl = String(k).toLowerCase();

      // [PATCH-ID] idKey(payment_id 등)는 서버에서만 관리 → payload 무시
      if (__IDKEY_LOWER__ && kl === __IDKEY_LOWER__) return;
      // 시스템/감사 필드는 서버에서 관리
      if (k === 'created_at' || k === 'created_by' || k === 'updated_at' || k === 'updated_by') return;
      if (k === 'is_deleted') return;
      if (k === '_mode') return;

      // [PATCH-NUM] 숫자필드는 콤마 제거 + 숫자화
      if (__NUM_FIELDS__[kl]) {
        out[k] = __normNumForCell__(o[k]);
      } else {
        out[k] = o[k];
      }
    });
    out.year = String(year) + '년';
    out.month = String(month) + '월';
    out.employee_id = String(o.employee_id || '').trim();
    if (delCol) out.is_deleted = PAYROLL_normNotDeletedValue_(); // '0'
    return out;
  }

  var changed = false;

  // 1) UPDATE / DELETE
  Object.keys(incomingByEmp).forEach(function(eid){
    var incoming = incomingByEmp[eid];
    var exists = existingByEmp[eid];
    if (!exists) return;

    var row = exists.row;

    if (isDeleteMode_(incoming)){
      if (delCol) row[delCol-1] = PAYROLL_normDeletedValue_(); // '1'
      if (uAtCol) row[uAtCol-1] = now;
      if (uByCol) row[uByCol-1] = actorLabel;
      vals[exists.idx] = row;
      changed = true;
      return;
    }

    var obj = normalizeForWrite_(incoming);

    // updated
    if (uAtCol) row[uAtCol-1] = now;
    if (uByCol) row[uByCol-1] = actorLabel;
    if (delCol) row[delCol-1] = PAYROLL_normNotDeletedValue_(); // '0'

    // 덮어쓰기(헤더 존재하는 것만)
    Object.keys(obj).forEach(function(k){
      if (map[k] == null) return;
      row[map[k]] = obj[k];
    });
    vals[exists.idx] = row;
    changed = true;
  });

  // ===== 2) SOFT DELETE: 기존에 있는데 payload에 없으면 삭제 처리 =====
  if (delCol){
    Object.keys(existingByEmp).forEach(function(eid){
      if (incomingByEmp[eid]) return; // payload에 있으면 유지
      var info = existingByEmp[eid];
      var row = info.row;

      row[delCol-1] = PAYROLL_normDeletedValue_(); // '1'
      if (uAtCol) row[uAtCol-1] = now;
      if (uByCol) row[uByCol-1] = actorLabel;

      vals[info.idx] = row;
      changed = true;
    });
  }

  // 2) WRITE BACK 업데이트
  if (changed && lastRow >= 2){
    sh.getRange(2,1,lastRow-1,lastCol).setValues(vals);
  }

  // 3) INSERT (existing 없고 delete 모드도 아닌 것만)
  var toAppend = [];
  Object.keys(incomingByEmp).forEach(function(eid){
    if (existingByEmp[eid]) return;
    var incoming = incomingByEmp[eid];
    if (isDeleteMode_(incoming)) return;

    var obj = normalizeForWrite_(incoming);
    if (!obj.employee_id) return;

    // created/updated
    if (cAtCol) obj.created_at = now;
    if (cByCol) obj.created_by = actorLabel;
    if (uAtCol) obj.updated_at = now;
    if (uByCol) obj.updated_by = actorLabel;

    if (idCol && idKey && (obj[idKey] == null || obj[idKey] === '')) obj[idKey] = nextId++;

    var rowOut = new Array(header.length).fill('');
    Object.keys(obj).forEach(function(k){
      if (map[k] == null) return;
      rowOut[map[k]] = obj[k];
    });
    toAppend.push(rowOut);
  });

  if (toAppend.length){
    sh.getRange(sh.getLastRow()+1, 1, toAppend.length, header.length).setValues(toAppend);
  }

  // ✅ 캐시 무효화(이 year의 Payment 조회 캐시만)
  PAYROLL_invalidatePaymentYearCache_(String(year));

    if (typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Payment');
    return { ok:true, year:year, month:month, saved:Object.keys(incomingByEmp).length };
  } finally {
    lock.releaseLock();
  }
}


// =========================================================
// ✅ (변경) 연도별 기준 저장: "update + insert + (누락분) soft delete"
// - 수정 시 새 행이 생성되지 않도록 한다.
// =========================================================
function PAYROLL_syncYearRows_(sheetName, y, newRows, actorLabel){
  newRows = Array.isArray(newRows) ? newRows : [];

  var sh = DB_sheet_(sheetName);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new Error('시트 컬럼이 없습니다: ' + sheetName);

  var header = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(v){ return String(v||'').trim(); });
  var map = {};
  header.forEach(function(k,i){ if (k) map[k]=i; });

  if (map.year == null) throw new Error(sheetName + ' 시트에 year 컬럼이 없습니다.');

  var yearCol = map.year + 1;
  var delCol  = (map.is_deleted != null) ? (map.is_deleted + 1) : 0;
  var uAtCol  = (map.updated_at != null) ? (map.updated_at + 1) : 0;
  var uByCol  = (map.updated_by != null) ? (map.updated_by + 1) : 0;
  var cAtCol  = (map.created_at != null) ? (map.created_at + 1) : 0;
  var cByCol  = (map.created_by != null) ? (map.created_by + 1) : 0;

  // id 컬럼(…_id) 자동 증가
  var idKey = null, idCol = 0;
  // ✅ PK 후보를 더 정확히 고른다 (employee_id를 PK로 착각 방지)
  function pickIdKey_(){
    var candidates = header.filter(function(k){ return k && /_id$/i.test(k); });
    if (!candidates.length) return null;

    // 1) 시트별 PK 패턴 우선
    var re =
      (sheetName === 'BaseSalary_Std'     || sheetName === 'BaseSalary_Std_Exc') ? /^(basesal|base_salary|basesalary).+_id$/i :
      (sheetName === 'Alw_Std')           ? /^(alw|allowance).+_id$/i :
      (sheetName === 'Socialins_Std')     ? /^(socialins|social_ins).+_id$/i :
      null;
    if (re){
      for (var i=0; i<candidates.length; i++){
        if (re.test(candidates[i])) return candidates[i];
      }
    }

    // 2) 그래도 없으면 employee_id 제외한 첫 _id
    for (var j=0; j<candidates.length; j++){
      if (String(candidates[j]).toLowerCase() === 'employee_id') continue;
      return candidates[j];
    }

    // 3) 최후: employee_id밖에 없으면 PK 자동증가 포기(null)
    return null;
  }
  idKey = pickIdKey_();
  if (idKey && map[idKey] != null) idCol = map[idKey] + 1;

  // ✅ 자연키 정의(시트별)
  function makeKey_(obj){
    var yr = PAYROLL_normYear_(obj.year) || y;
    if (sheetName === 'BaseSalary_Std'){
      return [
        yr,
        String(obj.expertise||'').trim(),
        String(obj.working_yearcount||'').trim()
      ].join('|');
    }
    if (sheetName === 'BaseSalary_Std_Exc'){
      return [
        yr,
        String(obj.employee_id||'').trim()
      ].join('|');
    }
    if (sheetName === 'Alw_Std'){
      return [
        yr,
        String(obj.category||'').trim(),
        String(obj.criteria||'').trim()
      ].join('|');
    }
    if (sheetName === 'Socialins_Std'){
      return [
        yr,
        String(obj.category||'').trim()
      ].join('|');
    }
    // fallback: year만
    return String(yr);
  }

  // ✅ year는 항상 "YYYY년"으로 저장
  function normalizeForWrite_(obj){
    obj = obj || {};
    var out = {};
    Object.keys(obj).forEach(function(k){ out[k]=obj[k]; });

    out.year = String(y) + '년';

    // BaseSalary_Std working_yearcount 보정("1" -> "1년차")
    if (sheetName === 'BaseSalary_Std'){
      var w = out.working_yearcount;
      var wn = String(w==null?'':w).match(/(\d+)/);
      if (wn) out.working_yearcount = String(Number(wn[1]||0)||0) + '년차';
    }

    if (delCol) out.is_deleted = PAYROLL_normNotDeletedValue_(); // '0'

    return out;
  }

  var now = new Date();

  // ===== 기존 데이터 로드(전체 range 1번만) =====
  var vals = [];
  if (lastRow >= 2){
    vals = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  }

  // ===== 기존행을 key로 인덱싱 (삭제되지 않은 것만) =====
  var existingByKey = {}; // key -> {rowIndex0, rowValues}
  for (var r=0; r<vals.length; r++){
    var row = vals[r];
    var rawYear = row[yearCol-1];
    if (PAYROLL_normYear_(rawYear) !== y) continue;

    // 삭제행이면 매칭 대상에서 제외(하지만 나중에 필요하면 재활성도 가능)
    if (delCol && PAYROLL_isDeletedValue_(row[delCol-1])) continue;

    // row -> obj(키 만들기 위해 최소 필드만 추출)
    var obj = {};
    for (var c=0; c<header.length; c++){
      var k = header[c];
      if (!k) continue;
      obj[k] = row[c];
    }
    // year normalize
    obj.year = y;

    var key = makeKey_(obj);
    if (key) existingByKey[key] = { idx: r, row: row };
  }

  // ===== 신규 id 시작값 계산(append용) =====
  var nextId = 1;
  if (idCol && lastRow >= 2){
    var ids = sh.getRange(2, idCol, lastRow-1, 1).getValues();
    var maxId = 0;
    for (var i=0; i<ids.length; i++){
      var n = Number(ids[i][0] || 0) || 0;
      if (n > maxId) maxId = n;
    }
    nextId = maxId + 1;
  }

  // ===== payload를 key map으로 (중복 방지) =====
  var incomingByKey = {};
  newRows.forEach(function(o){
    o = o || {};
    o.year = y; // 키 생성용
    var key = makeKey_(o);
    if (!key) return;
    incomingByKey[key] = o;
  });

  // ===== 1) UPDATE: existing에 있으면 해당 row 갱신 =====
  var changed = false;
  Object.keys(incomingByKey).forEach(function(key){
    var incoming = normalizeForWrite_(incomingByKey[key]);

    if (existingByKey[key]){
      var info = existingByKey[key];
      var row = info.row;

      // created_*는 유지, updated_*만 갱신
      if (uAtCol) row[uAtCol-1] = now;
      if (uByCol) row[uByCol-1] = actorLabel;

      // 일반 필드 덮어쓰기(헤더 존재하는 것만)
      Object.keys(incoming).forEach(function(k){
        if (map[k] == null) return;
        row[map[k]] = incoming[k];
      });

      // is_deleted는 false로 유지
      if (delCol) row[delCol-1] = PAYROLL_normNotDeletedValue_(); // '0'

      vals[info.idx] = row;
      changed = true;
    }
  });

  // ===== 2) SOFT DELETE: 기존에 있는데 payload에 없으면 삭제 처리 =====
  if (delCol){
    Object.keys(existingByKey).forEach(function(key){
      if (incomingByKey[key]) return;
      var info = existingByKey[key];
      var row = info.row;

      row[delCol-1] = PAYROLL_normDeletedValue_(); // '1'
      if (uAtCol) row[uAtCol-1] = now;
      if (uByCol) row[uByCol-1] = actorLabel;

      vals[info.idx] = row;
      changed = true;
    });
  }

  // ===== 3) WRITE BACK updates =====
  if (changed && lastRow >= 2){
    sh.getRange(2,1,lastRow-1,lastCol).setValues(vals);
  }

  // ===== 4) INSERT: payload에 있는데 기존에 없으면 append =====
  var toAppend = [];
  Object.keys(incomingByKey).forEach(function(key){
    if (existingByKey[key]) return;

    var obj = normalizeForWrite_(incomingByKey[key]);

    // created/updated 채움
    if (cAtCol) obj.created_at = now;
    if (cByCol) obj.created_by = actorLabel;
    if (uAtCol) obj.updated_at = now;
    if (uByCol) obj.updated_by = actorLabel;

    if (idCol && idKey && (obj[idKey] == null || obj[idKey] === '')) obj[idKey] = nextId++;

    var rowOut = new Array(header.length).fill('');
    Object.keys(obj).forEach(function(k){
      if (map[k] == null) return;
      rowOut[map[k]] = obj[k];
    });
    toAppend.push(rowOut);
  });

  if (toAppend.length){
    sh.getRange(sh.getLastRow()+1, 1, toAppend.length, header.length).setValues(toAppend);
  }
}

function PAYROLL_computeMonthly(payload){
  payload = payload || {};

   // ✅ 내부 계산용 옵션: 퇴직금 "도래월(13번째달) 몰아청구" 계산에서 재귀를 피하기 위한 플래그
   // - true면 severance는 "당월 월별 퇴직금(=월급여합계/12)"만 계산한다.
   var __SKIP_SEVERANCE_DUE__ = (payload.__skipSeverance === true);

  // 1) period("YYYY-MM") 지원
  if (!payload.year || !payload.month) {
    var p = String(payload.period || '').trim();
    var m = p.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
      payload.year = m[1];   // 일단 문자열로 넣고 아래에서 정규화
      payload.month = m[2];
    }
  }

  // 2) payload가 없거나 비었을 때는 "현재 연/월"로 기본 실행 (개발 편의)
  if (!payload.year || !payload.month) {
    var now = new Date();
    payload.year = payload.year || now.getFullYear();
    payload.month = payload.month || (now.getMonth() + 1);
  }

  var year = PAYROLL_normYearNumber_(payload.year);
  var month = PAYROLL_normMonthNumber_(payload.month);
  if (!year || !month || month < 1 || month > 12) throw new Error('Invalid year/month');

  var yKey1 = String(year);        // "2026"
  var yKey2 = String(year) + '년'; // "2026년"

  function _qYear2_(sheet, field){
    var a = PAYROLL_DB_queryByFieldCached_(sheet, field, yKey1) || [];
    var b = PAYROLL_DB_queryByFieldCached_(sheet, field, yKey2) || [];
    return a.concat(b);
  }

  var baseStd = _qYear2_('BaseSalary_Std', 'year');
  var baseExc = _qYear2_('BaseSalary_Std_Exc', 'year');
  var alwStd  = _qYear2_('Alw_Std', 'year');
  var insStd  = _qYear2_('Socialins_Std', 'year');
  var payRows = _qYear2_('Payment', 'year');

  var payMap = {};
  payRows.forEach(function(r){
    if (!r || PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var rm = String(r.month || '').replace(/[^0-9]/g,'');
    if (!rm) return;
    if (Number(rm) !== month) return;
    var eid = String(r.employee_id || '').trim();
    if (eid) payMap[eid] = r;
  });

  var baseMap = {};
  baseStd.forEach(function(r){
    if (!r || PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var k = [String(r.expertise||''), String(r.working_yearcount||'')].join('|');
    baseMap[k] = r;
  });

  var excMap = {};
  baseExc.forEach(function(r){
    if (!r || PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var eid = String(r.employee_id||'').trim();
    if (eid) excMap[eid] = r;
  });

  var alwMap = {};
  alwStd.forEach(function(r){
    if (!r || PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var cat = String(r.category||'').trim();
    // ✅ DB category(한글) → 내부 표준키로 정규화
    if (cat === '직위수당') cat = 'position';
    else if (cat === '자격수당') cat = 'expertise';
    else if (cat === '초과근무수당') cat = 'overtime';
    var k = [cat, String(r.criteria||'')].join('|');
    // amount는 숫자(예: 350000)로 저장되어 있다고 가정
    var n = Number(r.amount);
    alwMap[k] = (isFinite(n) ? n : 0);
  });

  var insRate = {};
  insStd.forEach(function(r){
    if (!r || PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var c = String(r.category||'').trim();
    // ✅ DB category(한글) → 내부 표준키(np/hi/ei/ii) 정규화
    if (c === '국민연금') c = 'np';
    else if (c === '건강보험') c = 'hi';
    else if (c === '고용보험') c = 'ei';
    else if (c === '산재보험') c = 'ii';

    // rate가 "0.000%" 형태일 수도 있으니 처리
    var rv = r.rate;
    var rate = 0;
    if (typeof rv === 'string' && rv.indexOf('%') >= 0){
      rate = (Number(rv.replace(/[^0-9.\-]/g,'')) || 0) / 100;
    } else {
      rate = Number(rv || 0) || 0;
    }
    if (c) insRate[c] = rate;
  });

  // =========================================================
  // ✅ 연도별 급여기준 캐시(정확버전: 과거 12개월 "월별 재계산" 용)
  // - 현재(year) 기준은 이미 baseMap/excMap/alwMap/insRate 로 구성됨
  // - 과거 12개월이 다른 연도로 넘어갈 수 있어 연도별로 다시 로딩/정규화
  // =========================================================
  var _stdCacheByYear = {};
  _stdCacheByYear[year] = { baseMap: baseMap, excMap: excMap, alwMap: alwMap, insRate: insRate };

  function _qYear2local_(yy, sheet, field){
    var y1 = String(yy);
    var y2 = String(yy) + '년';
    var a = PAYROLL_DB_queryByFieldCached_(sheet, field, y1) || [];
    var b = PAYROLL_DB_queryByFieldCached_(sheet, field, y2) || [];
    return a.concat(b);
  }

  function _getStdForYear_(yy){
    yy = Number(yy||0);
    if (!yy) return { baseMap:{}, excMap:{}, alwMap:{}, insRate:{} };
    if (_stdCacheByYear[yy]) return _stdCacheByYear[yy];

    var baseStd2 = _qYear2local_(yy, 'BaseSalary_Std', 'year');
    var baseExc2 = _qYear2local_(yy, 'BaseSalary_Std_Exc', 'year');
    var alwStd2  = _qYear2local_(yy, 'Alw_Std', 'year');
    var insStd2  = _qYear2local_(yy, 'Socialins_Std', 'year');

    var baseMap2 = {};
    baseStd2.forEach(function(r){
      if (!r || PAYROLL_isDeletedValue_(r.is_deleted)) return;
      var k = [String(r.expertise||''), String(r.working_yearcount||'')].join('|');
      baseMap2[k] = r;
    });

    var excMap2 = {};
    baseExc2.forEach(function(r){
      if (!r || PAYROLL_isDeletedValue_(r.is_deleted)) return;
      var eid2 = String(r.employee_id||'').trim();
      if (eid2) excMap2[eid2] = r;
    });

    var alwMap2 = {};
    alwStd2.forEach(function(r){
      if (!r || PAYROLL_isDeletedValue_(r.is_deleted)) return;
      var cat = String(r.category||'').trim();
      if (cat === '직위수당') cat = 'position';
      else if (cat === '자격수당') cat = 'expertise';
      else if (cat === '초과근무수당') cat = 'overtime';
      var k = [cat, String(r.criteria||'')].join('|');
      var n = Number(r.amount);
      alwMap2[k] = (isFinite(n) ? n : 0);
    });

    var insRate2 = {};
    insStd2.forEach(function(r){
      if (!r || PAYROLL_isDeletedValue_(r.is_deleted)) return;
      var c = String(r.category||'').trim();
      if (c === '국민연금') c = 'np';
      else if (c === '건강보험') c = 'hi';
      else if (c === '고용보험') c = 'ei';
      else if (c === '산재보험') c = 'ii';

      var rv = r.rate;
      var rate = 0;
      if (typeof rv === 'string' && rv.indexOf('%') >= 0){
        rate = (Number(rv.replace(/[^0-9.\-]/g,'')) || 0) / 100;
      } else {
        rate = Number(rv || 0) || 0;
      }
      if (c) insRate2[c] = rate;
    });

    _stdCacheByYear[yy] = { baseMap: baseMap2, excMap: excMap2, alwMap: alwMap2, insRate: insRate2 };
    return _stdCacheByYear[yy];
  }

  function _addMonthsYm_(y, m, delta){
    // m: 1~12
    var d = new Date(y, (m-1) + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth()+1 };
  }

  // ✅ Payroll 대상 직원: Employee 시트에서 category='직원' AND manage='창업지원단'
  var employees = PAYROLL_listEmployeesForPayroll_();

  var period = _payroll_period_(year, month);
  var ps = period.start;
  var pe = period.end;
  var label = period.label;

  var attendance = [];
  var budget = [];
  var actual = [];

  // =========================================================
  // ✅ 공통매핑(관리기간)용: 자식 시트 로딩
  // - Agreement(계약) + Experience(내부경력(적용))을 읽어
  //   직원별 관리기간(min start ~ max end)과 월별 재직/퇴직을 판단
  // =========================================================
  var employeeIdList = (employees || []).map(function(e){ return String((e||{}).employee_id||'').trim(); })
    .filter(function(v){ return !!v; });

  // 시트명은 프로젝트에서 실제 사용 중인 이름으로 맞춰둠
  // (다르면 여기만 바꾸면 됨)
  var agreementRows  = PAYROLL_readSheetObjects_('Employee_Agreement');
  var experienceRows = PAYROLL_readSheetObjects_('Employee_Experience');
  var positionRows   = PAYROLL_readSheetObjects_('Employee_Position');
  // ✅ 직무전문성: 학력/자격 기반
  var educationRows      = PAYROLL_readSheetObjects_('Employee_Education');
  var qualificationRows  = PAYROLL_readSheetObjects_('Employee_Qualification');

  var agreementByEmp = PAYROLL_groupByEmployeeId_(agreementRows);
  var experienceByEmp = PAYROLL_groupByEmployeeId_(experienceRows);
  var positionByEmp = PAYROLL_groupByEmployeeId_(positionRows);
  var educationByEmp = PAYROLL_groupByEmployeeId_(educationRows);
  var qualificationByEmp = PAYROLL_groupByEmployeeId_(qualificationRows);

  employees.forEach(function(emp){
    if (!emp || emp.is_deleted === true || emp.is_deleted === 'true') return;
    var eid = String(emp.employee_id || '').trim();
    if (!eid) return;
    // ✅ 공백 표시용 (프론트에서 0원으로 치환되는 걸 막기 위해 NBSP 사용)
    var BLANK = '\u00A0';

    // ✅ 호환키 제거: Employee 표준 키만 사용
    var name = String(emp.name || '').trim();
    var statusNow = String(emp.status || '').trim();

    // =========================================================
    // ✅ (변경) 관리기간 기반 월 행 생성 + 월별 재직/퇴직 판단
    // - spans = 계약기간들 + 내부경력(적용) 기간들
    // - mgmtWindow = min(start) ~ max(end)
    // - 해당 월(ps~pe)이 mgmtWindow와 1일이라도 겹치면 "행 생성"
    // - 월 상태: spans 중 하나라도 월과 겹치면 '재직', 아니면(관리기간 내 공백월) '퇴직'
    // =========================================================
    var spans = PAYROLL_collectSpans_(eid, agreementByEmp[eid], experienceByEmp[eid], pe);
    var mgmt = PAYROLL_mgmtWindow_(spans);
    if (!mgmt) return; // 계약/적용경력 둘 다 없으면 Payroll 관리대상 아님(행 미생성)

    // 월이 관리기간과 안 겹치면 이 월의 행은 만들지 않음
    if (!_overlap_(mgmt.start, mgmt.end, ps, pe)) return;

    // ✅ 근무(재직/퇴직) + 근무일수(UNION) 계산
    var isWorking = PAYROLL_isWorkingInMonth_(spans, ps, pe);
    var statusWorking = isWorking ? '재직' : '퇴직';

    var ev = PAYROLL_contractEventsInMonth_(spans, ps, pe); // {starts:[Date], ends:[Date]}
    var startsText = PAYROLL_joinDates_(ev.starts);
    var endsText   = PAYROLL_joinDates_(ev.ends);

    var unionDays = isWorking ? PAYROLL_unionOverlapDays_(spans, ps, pe) : 0;
    var daysInMonth = PAYROLL_daysInclusive_(ps, pe);
    var workingDaysText = '';
    if (isWorking){
      // ✅ 월 전체를 다 채우면(계약종료일이 말일이어도) 무조건 '1개월'
      // 그 외는 'NN일'
      if (unionDays >= daysInMonth) workingDaysText = '1개월';
      else workingDaysText = String(unionDays) + '일';
    }

    // =========================================================
    // ✅ 퇴직(근무시점) 월은 "값 계산하지 않고 공백"
    // - 재직 월만: 총근무연수/연차, 직위/유지기간, 직무전문성 계산
    // - 기준 시점: 근태/급여기간 "시작일(ps)" (요구사항)
    // =========================================================
    var tenureText = '';
    var yearcount = '';
    var position = '';
    var positionKeepText = '';
    var expertise = '';

    if (isWorking){
      // ===== 총근무연수(누적) =====
      // ✅ 확정 규칙(사용자 정의):
      // 1) "근무(재직) 월"이면 매월 기본 +1개월(=30일) 누적
      // 2) 만근(working_days='1개월')이면 그 달 추가 일수 0
      // 3) 부분근무(working_days='NN일')이면 NN일을 추가로 누적
      // 4) 표기 Start는 항상 "전월 End + 1일"
      //
      // 경력(Experience):
      // - 외부경력(적용): period(개월) 전체를 기초개월로 항상 더함
      // - 내부경력(적용): period(개월)을 "월 단위"로 누적(행 생성에 쓰는 관리기간과 별개로, tenure의 월수에 반영)

      var expRows = experienceByEmp[eid] || [];
      var agRows  = agreementByEmp[eid] || [];

      var prevEnd = PAYROLL_prevMonthEnd_(ps);

      // 전월 말까지 누적(= prevEnd 기준)
      var prevAcc = PAYROLL_tenureAccUpTo_(expRows, agRows, prevEnd);
      var prevEndDays = prevAcc.totalDays;

      // 이번달(=ps~pe) 추가분 계산 (✅ B안)
      // - 계약이 "만근"이면: +30일(=1개월)
      // - 계약이 "부분근무"이면: +NN일(일수만), +30일은 더하지 않음
      // - 계약이 아예 없으면: (근무월의 기준 30일을 적용할지 정책 필요)
      //   -> 지금은 "계약 없는 달은 30일(+1개월)"로 유지(경력월/내부경력월용)
      var addMonthDays = 30;
      var addExtraDays = 0;
      var agUnionThisMonth = PAYROLL_agreementUnionDaysInMonth_(agRows, ps, pe);
      if (agUnionThisMonth > 0 && agUnionThisMonth < daysInMonth){
        // ✅ 부분근무월: 30일은 빼고, 일수만 반영
        addMonthDays = 0;
        addExtraDays = agUnionThisMonth;
      } else if (agUnionThisMonth >= daysInMonth && agUnionThisMonth > 0){
        // ✅ 만근월: 30일만
        addMonthDays = 30;
        addExtraDays = 0;
      } else {
        // 계약이 없는 달(경력만으로 근무월이 되는 케이스): 기존대로 30일
        addMonthDays = 30;
        addExtraDays = 0;
      }

      var startDays = prevEndDays + 1;                 // ✅ start는 무조건 +1일
      var endDays   = prevEndDays + addMonthDays + addExtraDays;

      var tenStart = PAYROLL_tenureFromTotalDays_(startDays);
      var tenEnd   = PAYROLL_tenureFromTotalDays_(endDays);
      tenureText = PAYROLL_fmtTenureRangeFromTenure_(tenStart, tenEnd);
      yearcount = PAYROLL_yearcountFromTenure_(tenStart);

      // ===== 직위(월 시작일 기준) + 직위유지기간(누적) =====
      var posSeg = PAYROLL_pickPositionSegmentAt_(positionByEmp[eid], ps);
      position = posSeg.has ? (posSeg.name || '') : '';
      if (posSeg.has){
        // ✅ 동일 직위명 누적 유지기간(여러 row 누적, 공백/타직위는 제외)
        // ✅ 총근무연수와 동일 규칙:
        // start = 전월말 누적 + 1일, end = 월말 누적
        var prevEnd = PAYROLL_prevMonthEnd_(ps);
        var cumPrevEnd = PAYROLL_positionCumDaysByName_(positionByEmp[eid], position, prevEnd);
        var cumMonthEnd = PAYROLL_positionCumDaysByName_(positionByEmp[eid], position, pe);

        var startDays = (cumPrevEnd > 0 ? (cumPrevEnd + 1) : 1);
        var endDays   = cumMonthEnd;
        // 안전장치: (데이터/컷오프 이슈로) end < start면 같은 값으로 표시
        if (endDays < startDays) startDays = endDays;

        var pkStart = PAYROLL_tenureFromTotalDays_(startDays);
        var pkEnd   = PAYROLL_tenureFromTotalDays_(endDays);
        positionKeepText = PAYROLL_fmtTenureRangeFromTenure_(pkStart, pkEnd);
      }

      // ===== 직무전문성(월 단위, 반영일이 포함되는 월부터 계속 유지) =====
      expertise = PAYROLL_pickExpertiseCategory_(educationByEmp[eid], qualificationByEmp[eid], ps);
    }
    else {
      // ✅ 중요:
      // 프론트에서 (v || 0) 같은 처리 시 ''(빈문자)은 0으로 바뀌어 보일 수 있음.
      // 그래서 "보이는 공백" NBSP를 내려서 0 치환을 방지한다.
      workingDaysText = BLANK;       // 근무일수는 반드시 공백처럼
      tenureText = BLANK;            // 총근무연수 공백
      positionKeepText = BLANK;      // 직위유지기간 공백
      yearcount = '';                // 총근무연차(년차)는 완전 공백
      position = '';                 // 직위 공백
      expertise = '';                // 직무전문성 공백(추후 너가 잡을 예정)
    }
 
    attendance.push({
      payroll_period: label,
      employee_id: eid,
      name: name,
      status_now: statusNow,
      status_working: statusWorking,
      // 계약 시작/종료일은 해당 월에 이벤트가 있는 경우에만 표기(복수면 콤마)
      contract_start: startsText,
      contract_end: endsText,
      // 근무일수 표기: 재직=1개월/NN일, 퇴직=공백
      working_days: workingDaysText,
      // 총근무연수/연차(월 시작 기준)
      total_working_tenure: tenureText,
      working_yearcount: yearcount,
      // 직위/직위유지기간(월 말 기준 + 누적표기)
      position: position,
      position_keep: positionKeepText,
      // 직무전문성(월 말 기준)
      expertise: expertise
    });

    // ==========================
    // 예산 산출(budget)
    // - 퇴직 월은 예산 0 처리(관리기간 내 공백월)
    // ==========================
    var baseYear = 0, baseMonth = 0, alwPos = 0, alwExp = 0, fixed = 0, overtime = 0, salaryTotal = 0;
    var np = 0, hi = 0, ei = 0, ii = 0, insTotal = 0, severance = 0, cost = 0;

    var pay = payMap[eid];

    if (isWorking){
       // ✅ 이 budget 섹션에서도 동일 변수 사용(위 tenure 섹션에서 쓰던 값 재사용 목적)
       var expRows = experienceByEmp[eid] || [];
       var agRows  = agreementByEmp[eid] || [];

      // ✅ yearcount 키 정규화: 6  -> "6년차", "6년차"는 그대로
      var ycKey = String(yearcount == null ? '' : yearcount).trim();
      if (/^\d+$/.test(ycKey)) ycKey = ycKey + '년차';

      // ✅ 직무전문성: (미보유만 미보유, 나머지는 보유로)
      var expKey = (String(expertise||'').trim() === '미보유') ? '미보유' : '보유';
      if (excMap[eid]) baseMonth = Number(excMap[eid].amount_month || 0) || 0;
      else {
        var k = [expKey, ycKey].join('|');
        baseMonth = baseMap[k] ? (Number(baseMap[k].amount_month || 0) || 0) : 0;
      }

      // ✅ 기준연봉도 같은 규칙으로 계산(예외 우선)
      if (excMap[eid]) baseYear = Number(excMap[eid].amount_year || 0) || 0;
      else {
        var k2 = [expKey, ycKey].join('|');
        baseYear = baseMap[k2] ? (Number(baseMap[k2].amount_year || 0) || 0) : 0;
      }
      alwPos = alwMap[['position', position].join('|')] || 0;
      // 자격수당 criteria는 보유/미보유 기준으로 매핑
      alwExp = alwMap[['expertise', expKey].join('|')] || 0;
  
      // =========================================================
      // ✅ (수정) 중도입사/중도퇴사 월: "고정급 구성 항목"에 일할을 먼저 적용
      // - 기존: fixed만 일할 → 기본급/수당 컬럼과 fixed_sum 불일치 발생
      // - 변경: baseMonth/alwPos/alwExp 각각을 일할 후 fixed = 합계로 재구성
      //
      // 규칙:
      // - 계약이 있는 직원(agRows 존재)만 "계약근무일수/월일수"로 일할 적용
      // - agUnion=0이면 해당월 고정급 구성항목을 0 처리
      // - 계약이 없으면(경력만으로 isWorking 되는 케이스) 100% 유지
      // =========================================================
      var agUnionThisMonth = PAYROLL_agreementUnionDaysInMonth_(agRows, ps, pe);
      if (agUnionThisMonth > 0 && daysInMonth > 0 && agUnionThisMonth < daysInMonth){
        // ✅ 부분월(중도입/퇴사 등): 항목별 일할(반올림)
        baseMonth = Math.round(baseMonth * agUnionThisMonth / daysInMonth);
        alwPos    = Math.round(alwPos    * agUnionThisMonth / daysInMonth);
        alwExp    = Math.round(alwExp    * agUnionThisMonth / daysInMonth);
      } // ✅ agUnion=0 이면(해당월 계약 없음) 일할 미적용 → 내부경력(적용) 재직달도 정상 계산
      fixed = (Number(baseMonth||0)||0) + (Number(alwPos||0)||0) + (Number(alwExp||0)||0);

      // ✅ 초과근무수당(예상)은 Alw_Std의 "상한액"을 그대로 표기
      overtime = alwMap[['overtime','상한액'].join('|')] || 0;
      salaryTotal = fixed + overtime;

      np = _calcRate_(fixed, insRate.np);
      hi = _calcRate_(fixed, insRate.hi);
      ei = _calcRate_(fixed, insRate.ei);
      ii = _calcRate_(fixed, insRate.ii);
      insTotal = np + hi + ei + ii;

      // =========================================================
      // ✅ 퇴직금(정확버전, "관리기간(계약+내부경력(적용))-월" 기준)
      // - 기준: 월급여합계(salaryTotal = fixed + overtime)
      // - 트리거: "관리기간(Agreement + 내부경력(적용)) 연속 블록" 시작월 기준
      //   * 시작월 포함 1~12개월: 0
      //   * 시작월 포함 13번째 달(=다음해 같은 월): 직전 12개월 합 + 당월(1회 몰아청구)
      //   * 이후: 당월분만
      // - 관리기간이 끊기면 블록이 새로 시작(리셋)
      // =========================================================

      // ✅ 퇴직금 기준 span: agreement + experience_apply (관리기간)
      var sevSpans = (spans || []).filter(function(sp){
        return sp && (sp.type === 'agreement' || sp.type === 'experience_apply');
      });

      function _calcSalaryTotalForMonth_(psMonth, peMonth){
        // ✅ 관리기간(계약+내부경력(적용))이 1일이라도 겹치는 달만 산정 대상
        var unionAny = PAYROLL_unionOverlapDays_(sevSpans, psMonth, peMonth);
        if (!(unionAny > 0)) return 0;

        // ✅ 일할(부분월)은 "계약이 있는 달"에만 적용(기존 규칙 유지)
        var agUnion = PAYROLL_agreementUnionDaysInMonth_(agRows, psMonth, peMonth);
        var dim2 = PAYROLL_daysInclusive_(psMonth, peMonth);

        // 연도별 기준 가져오기(과거월이 다른 연도일 수 있음)
        var std = _getStdForYear_(psMonth.getFullYear());

        // 월 시작 기준 연차(yearcount): 전월 말 누적 + 1일
        var prevEnd2 = PAYROLL_prevMonthEnd_(psMonth);
        var prevAcc2 = PAYROLL_tenureAccUpTo_(expRows, agRows, prevEnd2);
        var prevEndDays2 = Number(prevAcc2.totalDays || 0) || 0;

        var tenStart2 = PAYROLL_tenureFromTotalDays_(prevEndDays2 + 1);
        var yc2 = PAYROLL_yearcountFromTenure_(tenStart2);
        var ycKey2 = String(yc2 == null ? '' : yc2).trim();
        if (/^\d+$/.test(ycKey2)) ycKey2 = ycKey2 + '년차';

        // 월 시작 기준 직위/전문성
        var posSeg2 = PAYROLL_pickPositionSegmentAt_(positionByEmp[eid], psMonth);
        var posName2 = posSeg2.has ? (posSeg2.name || '') : '';

        var expCat2 = PAYROLL_pickExpertiseCategory_(educationByEmp[eid], qualificationByEmp[eid], psMonth);
        var expKey2 = (String(expCat2||'').trim() === '미보유') ? '미보유' : '보유';

        // 기준급(예외 우선)
        var baseMonth2 = 0;
        if (std.excMap && std.excMap[eid]) baseMonth2 = Number(std.excMap[eid].amount_month || 0) || 0;
        else {
          var k3 = [expKey2, ycKey2].join('|');
          baseMonth2 = (std.baseMap && std.baseMap[k3]) ? (Number(std.baseMap[k3].amount_month || 0) || 0) : 0;
        }

        // 수당
        var alwPos2 = (std.alwMap && std.alwMap[['position', posName2].join('|')]) || 0;
        var alwExp2 = (std.alwMap && std.alwMap[['expertise', expKey2].join('|')]) || 0;

        // 초과근무수당(예상): 상한액
        var overtime2 = (std.alwMap && std.alwMap[['overtime','상한액'].join('|')]) || 0;

        // ✅ 과거월도 동일: 항목별 일할 후 fixed 재구성(컬럼/합계 정합성 유지)
        if (agUnion > 0 && dim2 > 0 && agUnion < dim2){
          baseMonth2 = Math.round(baseMonth2 * agUnion / dim2);
          alwPos2    = Math.round(alwPos2    * agUnion / dim2);
          alwExp2    = Math.round(alwExp2    * agUnion / dim2);
        } // 만근이면 그대로
        var fixed2 = (Number(baseMonth2||0)||0) + (Number(alwPos2||0)||0) + (Number(alwExp2||0)||0);
        return fixed2 + (Number(overtime2 || 0) || 0);
      }

      var monthlySevCur = Math.round(salaryTotal / 12);
      if (__SKIP_SEVERANCE_DUE__){
        severance = monthlySevCur;
      } else {
        var blk = PAYROLL_mgmtBlockInfoInMonth_(sevSpans, ps, pe); // {start,end}
        if (!blk || !blk.start){
          severance = 0;
        } else {
          var monthsFromStart = PAYROLL_monthsInclusive_(blk.start, ps); // 시작월~현재월 inclusive
          if (monthsFromStart <= 12){
            severance = 0;
          } else if (monthsFromStart === 13){
            // ✅ 도래월(13번째 달): 직전 12개월(달별 재계산) 합 + 당월
            var sumPrev12 = 0;
            for (var i=12; i>=1; i--){
              var ym = _addMonthsYm_(year, month, -i);
              var ps2 = new Date(ym.y, ym.m-1, 1);
              var pe2 = new Date(ym.y, ym.m, 0);
              var sal2 = _calcSalaryTotalForMonth_(ps2, pe2);
              sumPrev12 += Math.round(sal2 / 12);
            }
            severance = sumPrev12 + monthlySevCur;
          } else {
            severance = monthlySevCur;
          }
        }
       }

      cost = salaryTotal + insTotal + severance;
    } else {
      // ✅ 근무시점 퇴직 월: 0원 표기 금지 → 전부 공백(NBSP)로 내려보냄
      baseYear = BLANK;
      baseMonth = BLANK;
      alwPos = BLANK;
      alwExp = BLANK;
      fixed = BLANK;
      overtime = BLANK;
      salaryTotal = BLANK;
      np = BLANK; hi = BLANK; ei = BLANK; ii = BLANK;
      insTotal = BLANK;
      severance = BLANK;
      cost = BLANK;
    }

    budget.push({
      payroll_period: label,
      employee_id: eid,
      name: name,
      status_now: statusNow,
      base_year: baseYear,
      base_month: baseMonth,
      alw_position: alwPos,
      alw_expertise: alwExp,
      fixed_sum: fixed,
      alw_overtime: overtime,
      month_pay_sum: salaryTotal,
      ins_np: np,
      ins_hi: hi,
      ins_ei: ei,
      ins_ii: ii,
      ins_total: insTotal,
      severance: severance,
      labor_total: cost
    });

    // ==========================
    // 실지급(actual) - DB(Payment) 최소 컬럼화 대응
    // - 월급여 합계 = salary + alw_overtime
    // - 4대 합계    = np + hi + ei + ii   (DB 컬럼 제거 가능)
    // - 총인건비    = 월급여합계 + 4대합계 + 퇴직금 (DB 컬럼 제거 가능)
    // ==========================
    var a_fixed = pay ? (Number(pay.salary || 0) || 0) : 0;
    var a_ot    = pay ? (Number(pay.alw_overtime || 0) || 0) : 0;

    var a_np    = pay ? (Number(pay.socialins_np || 0) || 0) : 0;
    var a_hi    = pay ? (Number(pay.socialins_hi || 0) || 0) : 0;
    var a_ei    = pay ? (Number(pay.socialins_ei || 0) || 0) : 0;
    var a_ii    = pay ? (Number(pay.socialins_ii || 0) || 0) : 0;

    var a_monthPay = a_fixed + a_ot;
    var a_insTotal = a_np + a_hi + a_ei + a_ii;

    var a_sev   = pay ? (Number(pay.severance || 0) || 0) : 0;
    var a_total = a_monthPay + a_insTotal + a_sev;

    // ==========================
    // 실지급(actual)
    // - DB 셀 공백: 공백(NBSP)로 내려서 UI도 공백
    // - DB 셀 0: 0은 그대로 0원
    // - ins_total / month_pay_sum / labor_total: 구성값 중 공백이 있으면 합계도 공백
    // ==========================
    function _numOrBlank_(v){
      if (v === '\u00A0') return '\u00A0';
      if (v === '' || v == null) return '\u00A0';
      var n = Number(v);
      return (isFinite(n) ? n : '\u00A0');
    }
    function _asZero_(v){
      return (v === '\u00A0' ? 0 : (Number(v||0) || 0));
    }
    function _sumAllowBlankAsZero_(a, b){
      return _asZero_(a) + _asZero_(b);
    }
    function _sum4AllowBlankAsZero_(a, b, c, d){
      return _asZero_(a) + _asZero_(b) + _asZero_(c) + _asZero_(d);
    }

    var a_fixed = pay ? _numOrBlank_(pay.salary)        : '\u00A0';
    var a_ot    = pay ? _numOrBlank_(pay.alw_overtime)  : '\u00A0';

    var a_np = pay ? _numOrBlank_(pay.socialins_np) : '\u00A0';
    var a_hi = pay ? _numOrBlank_(pay.socialins_hi) : '\u00A0';
    var a_ei = pay ? _numOrBlank_(pay.socialins_ei) : '\u00A0';
    var a_ii = pay ? _numOrBlank_(pay.socialins_ii) : '\u00A0';

    var a_monthPay = _sumAllowBlankAsZero_(a_fixed, a_ot);         // 월급여 합계(빈칸=0)
    var a_insTotal = _sum4AllowBlankAsZero_(a_np, a_hi, a_ei, a_ii);// 4대 합계(빈칸=0)
    var a_sev      = pay ? _numOrBlank_(pay.severance) : '\u00A0';

    // 총인건비(월급여+4대+퇴직금) : 빈칸=0
    var a_labor = Number(a_monthPay||0) + Number(a_insTotal||0) + _asZero_(a_sev);

    actual.push({
      payroll_period: label,
      employee_id: eid,
      name: name,
      status_now: statusNow,
      fixed_sum: a_fixed,
      alw_overtime: a_ot,
      month_pay_sum: a_monthPay,
      ins_np: a_np,
      ins_hi: a_hi,
      ins_ei: a_ei,
      ins_ii: a_ii,
      ins_total: a_insTotal,
      severance: a_sev,
      labor_total: a_labor
    });
  });

  var out = {
    ok: true,
    year: year,
    month: month,
    payroll_period: label,
    attendance: attendance,
    budget: budget,
    actual: actual
  };
  if (typeof _jsonSafeKst_ === 'function') return _jsonSafeKst_(out);
  return JSON.parse(JSON.stringify(out));
}

// =========================================================
// ✅ 총근무연수(확정 규칙) helpers
// =========================================================

function PAYROLL_prevMonthEnd_(monthStart){
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), 0);
}

function PAYROLL_tenureFromTotalDays_(totalDays){
  totalDays = Number(totalDays || 0) || 0;
  if (totalDays < 0) totalDays = 0;
  var totalMonths = Math.floor(totalDays / 30);
  var remDays = totalDays % 30;
  var years = Math.floor(totalMonths / 12);
  var months = totalMonths % 12;
  return { totalMonths: totalMonths, remDays: remDays, years: years, months: months };
}

function PAYROLL_tenureAccUpTo_(expRows, agRows, cutoffEnd){
  // cutoffEnd: 누적 기준일(전월 말 등)
  // return: { totalDays: number }
  var baseMonths = PAYROLL_experienceMonthsUpTo_(expRows, cutoffEnd); // 외부+내부(period월 누적)

  // 계약 누적: "근무월"마다 기본 +1개월(=30일) + (부분근무월만 NN일 추가)
  var agAcc = PAYROLL_agreementAccUpTo_(agRows, cutoffEnd);

  var totalDays = (baseMonths * 30) + agAcc.monthDays + agAcc.extraDays;
  return { totalDays: totalDays };
}

function PAYROLL_experienceMonthsUpTo_(rows, cutoffEnd){
  // 외부경력(적용): period를 항상 더함
  // 내부경력(적용): period를 "월 단위"로 누적(해당월 포함), cap=period
  var t = new Date(cutoffEnd.getFullYear(), cutoffEnd.getMonth(), cutoffEnd.getDate(), 0,0,0,0);
  var total = 0;
  (rows||[]).forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var cat = String(r.category || '').trim();
    var per = Number(r.period || 0) || 0;
    if (cat !== '내부경력(적용)' && cat !== '외부경력(적용)') return;

    if (cat === '외부경력(적용)'){
      if (per > 0) total += per;
      return;
    }

    // 내부경력(적용)
    var s = _parseYmdClamp_(r.working_start_date, 'start');
    var e = _parseYmdClamp_(r.working_end_date, 'end');
    if (!s) return;
    if (!e) e = t;
    var ss = new Date(s.getFullYear(), s.getMonth(), 1, 0,0,0,0);
    var ee = new Date(e.getFullYear(), e.getMonth(), 1, 0,0,0,0);
    var tt = new Date(t.getFullYear(), t.getMonth(), 1, 0,0,0,0);
    if (tt.getTime() < ss.getTime()) return;
    var useEnd = (tt.getTime() > ee.getTime()) ? ee : tt;
    var sm = ss.getFullYear()*12 + ss.getMonth();
    var cm = useEnd.getFullYear()*12 + useEnd.getMonth();
    var months = (cm - sm) + 1;
    if (months < 0) months = 0;
    if (per > 0 && months > per) months = per;
    total += months;
  });
  return total;
}

function PAYROLL_agreementAccUpTo_(agreements, cutoffEnd){
  // cutoffEnd까지의 계약 누적:
  // ✅ (B안) 계약 누적:
  // - 만근월: +30일(=1개월)
  // - 부분근무월: +NN일(일수만), 30일은 추가하지 않음
  var monthDays = 0;
  var extraDays = 0;
  if (!agreements || !agreements.length) return { monthDays:0, extraDays:0 };

  // 계약 span 정리
  var spans = [];
  (agreements||[]).forEach(function(a){
    if (!a) return;
    if (a.is_deleted === true || a.is_deleted === 'true') return;
    var s = _parseYmdClamp_(a.start_date, 'start');
    var e = _parseYmdClamp_(a.end_date, 'end');
    if (!s) return;
    if (!e) e = cutoffEnd;
    if (e.getTime() < s.getTime()) return;
    spans.push({ start: s, end: e });
  });
  if (!spans.length) return { monthDays:0, extraDays:0 };

  // ✅ 합집합 기준으로 계산하기 위해 merge
  var mergedSpans = PAYROLL_mergeIntervals_(spans);
  if (!mergedSpans.length) return { monthDays:0, extraDays:0 };

  // 월 루프: 계약이 1일이라도 겹치는 월들을 누적
  var cur = new Date(mergedSpans[0].start.getFullYear(), mergedSpans[0].start.getMonth(), 1);
  mergedSpans.forEach(function(sp){
    var m0 = new Date(sp.start.getFullYear(), sp.start.getMonth(), 1);
    if (m0.getTime() < cur.getTime()) cur = m0;
  });
  var endMonth = new Date(cutoffEnd.getFullYear(), cutoffEnd.getMonth(), 1);

  while (cur.getTime() <= endMonth.getTime()){
    var ms = new Date(cur.getFullYear(), cur.getMonth(), 1);
    var fullEnd = new Date(cur.getFullYear(), cur.getMonth()+1, 0); // 해당월 말일
    var windowEnd = (fullEnd.getTime() > cutoffEnd.getTime())
      ? new Date(cutoffEnd.getFullYear(), cutoffEnd.getMonth(), cutoffEnd.getDate())
      : fullEnd;

    // ✅ 합집합(merge) 기준 월내 계약근무일수
    var union = PAYROLL_unionOverlapDays_(mergedSpans, ms, windowEnd);
    if (union > 0){
      var isFullMonthWindow = (windowEnd.getTime() === fullEnd.getTime());
      if (isFullMonthWindow){
        var daysInFullMonth = PAYROLL_daysInclusive_(ms, fullEnd);
        if (union >= daysInFullMonth){
          // ✅ 만근월
          monthDays += 30;
        } else {
          // ✅ 부분근무월: 일수만
          extraDays += union;
        }
      } else {
        // cutoff로 인해 월이 잘린 경우(부분월): 일수만
        extraDays += union;
      }
    }

    cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
  }

  return { monthDays: monthDays, extraDays: extraDays };
}
// =========================================================
// ✅ 계약(Agreement) "연속" 누적 (퇴직금 기준용)
// - 계약이 끊기면(해당월 union=0) 그 이전은 누적에서 제외(리셋)
// - 월 단위 규칙은 기존과 동일:
//   * 월 전체를 채우면 30일(=1개월)
//   * 부분월은 실제 겹치는 일수만
// =========================================================
function PAYROLL_agreementContinuousAccUpTo_(agreements, cutoffEnd){
  var monthDays = 0;
  var extraDays = 0;
  if (!agreements || !agreements.length || !cutoffEnd) return { monthDays:0, extraDays:0, totalDays:0 };

  // 계약 span 정리 + merge(연속성: 하루 차이까지는 연속으로 merge)
  var spans = [];
  (agreements||[]).forEach(function(a){
    if (!a) return;
    if (a.is_deleted === true || a.is_deleted === 'true') return;
    var s = _parseYmdClamp_(a.start_date, 'start');
    var e = _parseYmdClamp_(a.end_date, 'end');
    if (!s) return;
    if (!e) e = cutoffEnd;
    if (e.getTime() < s.getTime()) return;
    spans.push({ start:s, end:e });
  });
  if (!spans.length) return { monthDays:0, extraDays:0, totalDays:0 };

  var merged = PAYROLL_mergeIntervals_(spans);
  if (!merged.length) return { monthDays:0, extraDays:0, totalDays:0 };

  // earliest month (루프 안전장치)
  var minS = merged[0].start;
  for (var i=1; i<merged.length; i++){
    if (merged[i].start.getTime() < minS.getTime()) minS = merged[i].start;
  }
  var minMonth = new Date(minS.getFullYear(), minS.getMonth(), 1);

  // cutoff 월부터 역방향으로 "연속"인 월만 누적
  var cur = new Date(cutoffEnd.getFullYear(), cutoffEnd.getMonth(), 1);
  while (cur.getTime() >= minMonth.getTime()){
    var ms = new Date(cur.getFullYear(), cur.getMonth(), 1);
    var monthEndFull = new Date(cur.getFullYear(), cur.getMonth()+1, 0);
    var me = (monthEndFull.getTime() > cutoffEnd.getTime())
      ? new Date(cutoffEnd.getFullYear(), cutoffEnd.getMonth(), cutoffEnd.getDate())
      : monthEndFull;

    var union = PAYROLL_unionOverlapDays_(merged, ms, me);
    if (union <= 0){
      // ✅ 이 달이 0이면 여기서 연속 종료(리셋 지점)
      break;
    }

    if (me.getTime() === monthEndFull.getTime()){
      var dim = PAYROLL_daysInclusive_(ms, monthEndFull);
      if (union >= dim){
        monthDays += 30;
      } else {
        extraDays += union;
      }
    } else {
      // cutoff로 잘린 달은 일수만
      extraDays += union;
    }

    // 이전 달로
    cur = new Date(cur.getFullYear(), cur.getMonth()-1, 1);
  }

  return { monthDays: monthDays, extraDays: extraDays, totalDays: (monthDays + extraDays) };
}


function PAYROLL_agreementUnionDaysInMonth_(agreements, ps, pe){
  // 이번달 계약 근무일수(합집합 근사: 계약이 많지 않으니 단순 합으로 충분)
  var spans = [];
  (agreements||[]).forEach(function(a){
    if (!a) return;
    if (a.is_deleted === true || a.is_deleted === 'true') return;
    var s = _parseYmdClamp_(a.start_date, 'start');
    var e = _parseYmdClamp_(a.end_date, 'end');
    if (!s) return;
    if (!e) e = pe;
    spans.push({ start:s, end:e });
  });
  if (!spans.length) return 0;

  // 합집합 계산(mergeIntervals 사용)
  var merged = PAYROLL_mergeIntervals_(spans);
  var total = 0;
  merged.forEach(function(it){
    if (!_overlap_(it.start, it.end, ps, pe)) return;
    var s = it.start.getTime() < ps.getTime() ? ps : it.start;
    var e = it.end.getTime() > pe.getTime() ? pe : it.end;
    total += PAYROLL_daysInclusive_(s, e);
  });
  return total;
}



/**
 * 스크립트 편집기에서 테스트 실행용
 * - 기본: 현재 연/월
 * - 지정: payload 넣기
 */
function PAYROLL_testComputeMonthly(){
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth() + 1;
  var res = PAYROLL_computeMonthly({ year: y, month: m });
  Logger.log(JSON.stringify({ ok: res.ok, period: res.payroll_period, counts: {
    attendance: (res.attendance||[]).length,
    budget: (res.budget||[]).length,
    actual: (res.actual||[]).length
  }}, null, 2));
}

/**
 * 범위 조회: from(YYYY/MM) ~ to(YYYY/MM) 월들을 순회하며 월별 계산결과를 합산 반환
 * payload:
 *  - from_year, from_month, to_year, to_month
 */
function PAYROLL_computeRange(payload){
  var __perf = (typeof DB_perfStart_ === 'function')
    ? DB_perfStart_('PAYROLL_computeRange')
    : null;
  var __perfMeta = { ok:false, months:0, attendance:0, budget:0, actual:0 };
  payload = payload || {};

  // ✅ 요청 시작 시 캐시 초기화(요청 단위 캐시)
  PAYROLL_resetRuntimeCaches_();

  // 기본값: 현재 월
  var now = new Date();
  var fy = PAYROLL_normYearNumber_(payload.from_year || payload.year || now.getFullYear());
  var fm = PAYROLL_normMonthNumber_(payload.from_month || payload.month || (now.getMonth() + 1));
  var ty = PAYROLL_normYearNumber_(payload.to_year || fy);
  var tm = PAYROLL_normMonthNumber_(payload.to_month || fm);

  if (!fy || !fm || fm < 1 || fm > 12) throw new Error('Invalid from year/month');
  if (!ty || !tm || tm < 1 || tm > 12) throw new Error('Invalid to year/month');

  // from <= to 검증
  if ((fy * 100 + fm) > (ty * 100 + tm)) throw new Error('Invalid range: from > to');

  var out = {
    ok: true,
    from_period: fy + '-' + (fm < 10 ? ('0'+fm) : fm),
    to_period: ty + '-' + (tm < 10 ? ('0'+tm) : tm),
    attendance: [],
    budget: [],
    actual: []
  };

  try{
    var cy = fy, cm = fm;
    while ((cy * 100 + cm) <= (ty * 100 + tm)) {
      var r = PAYROLL_computeMonthly({ year: cy, month: cm });
      out.attendance = out.attendance.concat(r.attendance || []);
      out.budget = out.budget.concat(r.budget || []);
      out.actual = out.actual.concat(r.actual || []);
      __perfMeta.months++;

      cm++;
      if (cm > 12) { cm = 1; cy++; }
    }

    __perfMeta.ok = true;
    __perfMeta.attendance = out.attendance.length;
    __perfMeta.budget = out.budget.length;
    __perfMeta.actual = out.actual.length;
    return out;
  } finally {
    if (__perf && typeof DB_perfEnd_ === 'function') DB_perfEnd_(__perf, __perfMeta);
  }
}

/**
 * Payroll 대상 직원 조회
 * - Employee 시트에서 category='직원' AND manage='창업지원단' 인 행만 사용
 * - is_deleted=true 는 제외
 *
 * 반환 형태는 "헤더 기반 object 배열" (DB_queryByField_ 결과와 동일한 형태를 기대)
 */
function PAYROLL_listEmployeesForPayroll_(){
  // ✅ 요청 단위 캐시
  if (PAYROLL__EMP_CACHE) return PAYROLL__EMP_CACHE;

  // 1) category='직원' 으로 1차 필터
  var rows = DB_queryByField_('Employee', 'category', '직원') || [];

  // 2) manage='창업지원단' + 삭제 제외
  var out = [];
  rows.forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    // ✅ 호환키 제거: Employee 표준 키만 사용
    var manage = String(r.manage || '').trim();
    if (manage !== '창업지원단') return;
    out.push(r);
  });
  PAYROLL__EMP_CACHE = out;
  return PAYROLL__EMP_CACHE;
}

// =========================================================
// ✅ Payment/선택목록용: 특정 월에 "근무시점=재직"인 직원 목록
// - 근태/급여(Attendance) 테이블에서 쓰는 판단 로직과 동일:
//   * 관리기간(spans=계약+내부경력(적용))이 그 월과 겹치면 "행 생성 대상"
//   * 그 월에 spans 중 하나라도 겹치면 근무시점=재직
// =========================================================
function PAYROLL_listWorkingEmployeesInMonth_(year, month){
  var y = PAYROLL_normYearNumber_(year);
  var m = PAYROLL_normMonthNumber_(month);
  if (!y || !m) throw new Error('Invalid year/month');

  var period = _payroll_period_(y, m);
  var ps = period.start;
  var pe = period.end;

  var employees = PAYROLL_listEmployeesForPayroll_() || [];

  // Payroll과 동일: 계약 + 내부경력(적용) 기준
  var agreementRows  = PAYROLL_readSheetObjects_('Employee_Agreement');
  var experienceRows = PAYROLL_readSheetObjects_('Employee_Experience');
  var agreementByEmp  = PAYROLL_groupByEmployeeId_(agreementRows);
  var experienceByEmp = PAYROLL_groupByEmployeeId_(experienceRows);

  var out = [];
  employees.forEach(function(emp){
    if (!emp || PAYROLL_isDeletedValue_(emp.is_deleted)) return;
    var eid = String(emp.employee_id || '').trim();
    if (!eid) return;

    // ✅ 근태/급여와 동일 span 수집 + 관리기간/근무시점 판정
    var spans = PAYROLL_collectSpans_(eid, agreementByEmp[eid], experienceByEmp[eid], pe);
    var mgmt = PAYROLL_mgmtWindow_(spans);
    if (!mgmt) return;                               // 관리대상 아님
    if (!_overlap_(mgmt.start, mgmt.end, ps, pe)) return; // 이 월 행 생성 대상 아님

    var isWorking = PAYROLL_isWorkingInMonth_(spans, ps, pe);
    if (!isWorking) return;                          // ✅ 근무시점=퇴직 월은 옵션에서 제외

    var nm = String(emp.name || '').trim();
    out.push({
      employee_id: eid,
      name: nm,
      label: eid + (nm ? (' ' + nm) : '')
    });
  });

  // 사번 정렬(문자열 기준)
  out.sort(function(a,b){
    return String(a.employee_id).localeCompare(String(b.employee_id));
  });

  return out;
}

// =========================================================
// ✅ Payment 화면용: 직원 선택옵션 API
// return: {ok, year, month, employees:[{employee_id,label}]}
// =========================================================
function PAYMENT_listEmployees(payload){
  payload = payload || {};
  var year = PAYROLL_normYearNumber_(payload.year);
  var month = PAYROLL_normMonthNumber_(payload.month);
  if (!year || !month) throw new Error('Invalid year/month');

  var list = PAYROLL_listWorkingEmployeesInMonth_(year, month);
  var out = {
    ok: true,
    year: year,
    month: month,
    payroll_period: year + '년 ' + (month < 10 ? ('0'+month) : month) + '월',
    employees: list.map(function(x){ return { employee_id:x.employee_id, label:x.label }; })
  };
  if (typeof _jsonSafeKst_ === 'function') return _jsonSafeKst_(out);
  return JSON.parse(JSON.stringify(out));
}

/**
 * 여러 후보 키 중 첫번째 값을 반환
 */
function _pick_(obj, keys){
  if (!obj || !keys) return '';
  for (var i=0; i<keys.length; i++){
    var k = keys[i];
    if (obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
  }
  return '';
}

function _payroll_period_(year, month){
  var start = new Date(year, month-1, 1);
  var end = new Date(year, month, 0);
  return { start:start, end:end, label: year + '-' + (month<10?('0'+month):month) };
}

function _parseYmd_(v){
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return v;
  var m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}

// =========================================================
// ✅ 공통매핑(관리기간) helpers (이 파일에 맞춰 추가)
// =========================================================

function PAYROLL_readSheetObjects_(sheetName, opts){
  opts = opts || {};
  var force = (opts.force === true);
  // ✅ 요청 단위 캐시 (force면 우회)
  if (!force && Object.prototype.hasOwnProperty.call(PAYROLL__SHEETOBJ_CACHE, sheetName)) {
    return PAYROLL__SHEETOBJ_CACHE[sheetName];
  }
  // DB_sheet_ 는 프로젝트 공통 DB util에 이미 있다고 가정
  // (없으면 기존 DB 유틸이 있는 파일명을 알려줘. 거기에 맞춰 즉시 수정 가능)
  try {
    var out = [];
    if (typeof DB_readRows_ === 'function') {
      var t = DB_readRows_(sheetName, { force: force });
      var rows = (t && t.rows) ? t.rows : [];
      rows.forEach(function(row){
        var obj = row || {};
        var keys = Object.keys(obj);
        var empty = true;
        for (var i=0; i<keys.length; i++){
          var v = obj[keys[i]];
          if (v !== '' && v != null) { empty = false; break; }
        }
        if (!empty) out.push(obj);
      });
    } else {
      var sh = DB_sheet_(sheetName);
      var lastRow = sh.getLastRow();
      var lastCol = sh.getLastColumn();
      if (lastRow >= 2 && lastCol >= 1) {
        var values = sh.getRange(1,1,lastRow,lastCol).getValues();
        var header = values[0].map(function(v){ return String(v||'').trim(); });
        for (var r=1; r<values.length; r++){
          var row = values[r];
          var obj = {};
          var empty = true;
          for (var c=0; c<header.length; c++){
            var k = header[c];
            if (!k) continue;
            var vv = row[c];
            if (vv !== '' && vv != null) empty = false;
            obj[k] = vv;
          }
          if (!empty) out.push(obj);
        }
      }
    }
    PAYROLL__SHEETOBJ_CACHE[sheetName] = out;
    return out;
  } catch(e){
    // ❗에러 결과는 캐시하지 않음(한 번 실패로 영구 빈값 방지)
    return [];
  }
}

function PAYROLL_groupByEmployeeId_(rows){
  var map = {};
  (rows || []).forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var eid = String(r.employee_id || '').trim();
    if (!eid) return;
    if (!map[eid]) map[eid] = [];
    map[eid].push(r);
  });
  return map;
}

function _parseYmdClamp_(v, mode){
  // mode: 'start' | 'end'
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]'){
    if (isNaN(v.getTime())) return null;
    if (mode === 'end') return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 23,59,59,999);
    return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 0,0,0,0);
  }
  var s = String(v||'').trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  var yy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
  if (!yy || !mm) return null;
  var d = new Date(yy, mm-1, dd, 0,0,0,0);
  // valid check
  if (d.getFullYear() === yy && d.getMonth() === (mm-1) && d.getDate() === dd){
    if (mode === 'end') return new Date(yy, mm-1, dd, 23,59,59,999);
    return d;
  }
  // invalid day -> clamp to last day of month
  var last = new Date(yy, mm, 0);
  if (mode === 'end') return new Date(yy, mm-1, last.getDate(), 23,59,59,999);
  return new Date(yy, mm-1, last.getDate(), 0,0,0,0);
}

function _overlap_(aStart, aEnd, bStart, bEnd){
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return (aStart.getTime() <= bEnd.getTime()) && (aEnd.getTime() >= bStart.getTime());
}

// =========================================================
// ✅ 직원근태 계산식(확정) helpers
// =========================================================

function PAYROLL_daysInclusive_(s, e){
  if (!s || !e) return 0;
  var ss = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0);
  var ee = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0,0,0,0);
  if (ss > ee) return 0;
  return Math.floor((ee - ss) / 86400000) + 1;
}

function PAYROLL_mergeIntervals_(spans){
  // spans: [{start:Date,end:Date},...]
  var arr = [];
  (spans||[]).forEach(function(sp){
    if (!sp || !sp.start || !sp.end) return;
    var s = new Date(sp.start.getFullYear(), sp.start.getMonth(), sp.start.getDate(), 0,0,0,0);
    var e = new Date(sp.end.getFullYear(), sp.end.getMonth(), sp.end.getDate(), 0,0,0,0);
    if (s > e) return;
    arr.push({ start:s, end:e });
  });
  if (!arr.length) return [];
  arr.sort(function(a,b){ return a.start.getTime() - b.start.getTime(); });
  var out = [arr[0]];
  for (var i=1; i<arr.length; i++){
    var cur = arr[i];
    var last = out[out.length-1];
    // inclusive 기준: 하루 차이까지는 연속으로 merge(끝 다음날이 시작이면 붙임)
    var lastNext = new Date(last.end.getTime() + 86400000);
    if (cur.start.getTime() <= lastNext.getTime()){
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      out.push(cur);
    }
  }
  return out;
}

function PAYROLL_unionOverlapDays_(spans, ps, pe){
  var merged = PAYROLL_mergeIntervals_(spans);
  var total = 0;
  for (var i=0; i<merged.length; i++){
    var it = merged[i];
    if (!_overlap_(it.start, it.end, ps, pe)) continue;
    var s = it.start < ps ? ps : it.start;
    var e = it.end > pe ? pe : it.end;
    total += PAYROLL_daysInclusive_(s, e);
  }
  return total;
}

function PAYROLL_cumWorkedDaysUntil_(mergedIntervals, cutoff){
  // cutoff(월 시작/월 말)까지의 누적 근무일수(합집합)
  var total = 0;
  if (!cutoff) return 0;
  var c = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate(), 0,0,0,0);
  for (var i=0; i<(mergedIntervals||[]).length; i++){
    var it = mergedIntervals[i];
    if (!it || !it.start || !it.end) continue;
    if (it.start.getTime() > c.getTime()) break;
    var e = it.end.getTime() > c.getTime() ? c : it.end;
    total += PAYROLL_daysInclusive_(it.start, e);
  }
  return total;
}

function PAYROLL_fmtTenureByDays_(days){
  days = Number(days||0) || 0;
  if (days < 0) days = 0;
  var totalMonths = Math.floor(days / 30);
  var remDays = days % 30;
  var years = Math.floor(totalMonths / 12);
  var months = totalMonths % 12;
  return totalMonths + '개월 ' + remDays + '일(' + years + '년 ' + months + '개월 ' + remDays + '일)';
}

function PAYROLL_fmtTenureRangeByDays_(startDays, endDays){
  return PAYROLL_fmtTenureByDays_(startDays) + ' ~ ' + PAYROLL_fmtTenureByDays_(endDays);
}

function PAYROLL_yearcountFromDays_(days){
  // 1~12개월 => 1년차, 13~24개월 => 2년차 ...
  days = Number(days||0) || 0;
  if (days < 0) days = 0;
  var months = Math.floor(days / 30);
  return Math.floor(months / 12) + 1;
}

function PAYROLL_contractEventsInMonth_(spans, ps, pe){
  var starts = [];
  var ends = [];
  (spans||[]).forEach(function(sp){
    if (!sp || !sp.start || !sp.end) return;
    // 계약(=agreement) + 내부경력(적용)=experience_apply 를 모두 "계약 이벤트"로 간주
    if (sp.type !== 'agreement' && sp.type !== 'experience_apply') return;
    var s = new Date(sp.start.getFullYear(), sp.start.getMonth(), sp.start.getDate(), 0,0,0,0);
    var e = new Date(sp.end.getFullYear(), sp.end.getMonth(), sp.end.getDate(), 0,0,0,0);
    if (s.getTime() >= ps.getTime() && s.getTime() <= pe.getTime()) starts.push(s);
    // 오픈엔드는 end가 월말로 보정될 수 있으므로: 실제로 "종료 이벤트"로 볼지 판단 필요
    // 여기서는 end가 null이었던 계약은 spans 생성 단계에서 월말로 보정되지만,
    // type='agreement'에서 원본 end가 비어있던 경우는 종료 이벤트로 넣지 않도록 막아야 함.
    // -> collectSpans_에서 open_end 플래그를 넣었으면 베스트지만, 지금은 우회:
    //    agreement end가 비어있는 경우는 PAYROLL_collectSpans_가 end를 rangeEnd로 채워도,
    //    해당 월의 종료일이 "진짜 종료"가 아니라면 표시하면 안 됨.
    //    따라서 agreement의 end 이벤트는 "원본 end 필드가 존재할 때만" 넣도록 별도 처리.
    if (sp.type === 'agreement'){
      if (sp._open_end === true) return;
    }
    if (e.getTime() >= ps.getTime() && e.getTime() <= pe.getTime()) ends.push(e);
  });
  starts.sort(function(a,b){ return a.getTime() - b.getTime(); });
  ends.sort(function(a,b){ return a.getTime() - b.getTime(); });
  return { starts: starts, ends: ends };
}

function PAYROLL_joinDates_(dates){
  if (!dates || !dates.length) return '';
  return dates.map(function(d){ return _fmtYmd_(d); }).join(', ');
}

function PAYROLL_pickPositionSegmentAt_(rows, atDate){
  // ✅ (확정) 근태/급여기간 "시작일" 기준 직위 1개 선택
  var t = new Date(atDate.getFullYear(), atDate.getMonth(), atDate.getDate(), 0,0,0,0);
  var segs = [];
  (rows||[]).forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    // ✅ (확정) Employee_Position 표준 키:
    // - name: 직위명
    // - start_date: 적용시작일
    // - end_date: 적용종료일(없으면 계속)
    var nm = String(r.name || '').trim();
    if (!nm) return;
    var s = _parseYmdClamp_(r.start_date, 'start');
    var e = _parseYmdClamp_(r.end_date, 'end');
    if (!s) return;
    if (!e) e = t; // 종료 없으면 조회시점까지로
    segs.push({ name: nm,
                start: new Date(s.getFullYear(),s.getMonth(),s.getDate(),0,0,0,0),
                end: new Date(e.getFullYear(),e.getMonth(),e.getDate(),0,0,0,0) });
  });
  if (!segs.length) return { has:false, name:'', start:null, end:null };
  // 1) 시점 포함 segment 우선
  var active = null;
  for (var i=0; i<segs.length; i++){
    var sp = segs[i];
    if (sp.start.getTime() <= t.getTime() && sp.end.getTime() >= t.getTime()){
      if (!active || sp.start.getTime() > active.start.getTime()) active = sp; // 가장 최근 시작 우선
    }
  }
  // 2) 없으면 시점 이전의 가장 최근 segment
  if (!active){
    segs.sort(function(a,b){ return a.start.getTime() - b.start.getTime(); });
    for (var j=0; j<segs.length; j++){
      if (segs[j].start.getTime() <= t.getTime()) active = segs[j];
    }
  }
  if (!active) return { has:false, name:'', start:null, end:null };
  return { has:true, name:active.name, start:active.start, end:active.end };
}

// =========================================================
// ✅ 총근무연수(누적) - Experience(period) 반영 helpers
// =========================================================

function PAYROLL_experienceBaseMonthsAt_(rows, cutoff){
  // - 외부경력(적용): period(개월) 항상 더함
  // - 내부경력(적용): 시작월부터 cutoff월까지 "월 단위"로 누적(해당월 포함),
  //   단, period가 있으면 그 최대치로 cap
  var t = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate(), 0,0,0,0);
  var total = 0;
  (rows||[]).forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var cat = String(r.category || '').trim();
    var per = Number(r.period || 0) || 0; // 개월(정수)
    if (cat !== '내부경력(적용)' && cat !== '외부경력(적용)') return;

    if (cat === '외부경력(적용)'){
      if (per > 0) total += per;
      return;
    }

    // 내부경력(적용)
    var s = _parseYmdClamp_(r.working_start_date, 'start');
    var e = _parseYmdClamp_(r.working_end_date, 'end');
    if (!s) return;
    if (!e) e = t;
    var ss = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0);
    var ee = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0,0,0,0);
    if (t.getTime() < ss.getTime()) return; // 아직 시작 전

    var useEnd = (t.getTime() > ee.getTime()) ? ee : t;
    // "월 단위 누적(해당월 포함)" : (YYYY*12+MM) 차이 + 1
    var sm = ss.getFullYear()*12 + ss.getMonth();
    var cm = useEnd.getFullYear()*12 + useEnd.getMonth();
    var months = (cm - sm) + 1;
    if (months < 0) months = 0;
    if (per > 0 && months > per) months = per;
    total += months;
  });
  return total;
}

function PAYROLL_collectAgreementOnlySpans_(agreements, rangeEnd){
  // 계약은 실제 근무일(일수) 누적 계산용으로만 사용
  var spans = [];
  (agreements || []).forEach(function(a){
    if (!a) return;
    if (a.is_deleted === true || a.is_deleted === 'true') return;
    var s = _parseYmdClamp_(a.start_date, 'start');
    var e = _parseYmdClamp_(a.end_date, 'end');
    if (!s) return;
    if (!e) e = rangeEnd ? new Date(rangeEnd.getTime()) : new Date();
    spans.push({ start: s, end: e });
  });
  return spans;
}

function PAYROLL_tenureFromBaseMonthsAndDays_(baseMonths, extraDays){
  baseMonths = Number(baseMonths || 0) || 0;
  extraDays = Number(extraDays || 0) || 0;
  if (baseMonths < 0) baseMonths = 0;
  if (extraDays < 0) extraDays = 0;
  var totalDays = (baseMonths * 30) + extraDays;
  var totalMonths = Math.floor(totalDays / 30);
  var remDays = totalDays % 30;
  var years = Math.floor(totalMonths / 12);
  var months = totalMonths % 12;
  return { totalMonths: totalMonths, remDays: remDays, years: years, months: months };
}

function PAYROLL_fmtTenureFromTenure_(t){
  if (!t) return '';
  return t.totalMonths + '개월 ' + t.remDays + '일(' + t.years + '년 ' + t.months + '개월 ' + t.remDays + '일)';
}

function PAYROLL_fmtTenureRangeFromTenure_(a, b){
  return PAYROLL_fmtTenureFromTenure_(a) + ' ~ ' + PAYROLL_fmtTenureFromTenure_(b);
}

function PAYROLL_yearcountFromTenure_(t){
  if (!t) return '';
  // ✅ 1-based 규칙(사용자 정의):
  // 1일 ~ 12개월 0일 => 1년차
  // 12개월 1일 ~ 24개월 0일 => 2년차 ...
  //
  // 경계값(12개월 0일, 24개월 0일 ...)에서 다음 년차로 넘어가지 않도록 보정
  var tm = Number(t.totalMonths || 0) || 0;
  var rd = Number(t.remDays || 0) || 0;
  if (tm < 0) tm = 0;
  if (rd < 0) rd = 0;

  // 예) 12개월 0일 -> 1년차, 24개월 0일 -> 2년차 ...
  if (rd === 0 && tm > 0 && (tm % 12) === 0){
    return tm / 12;
  }
  return Math.floor(tm / 12) + 1;
}


function PAYROLL_positionCumDaysInSegment_(seg, cutoff){
  if (!seg || !seg.has || !seg.start) return 0;
  var c = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate(), 0,0,0,0);
  var s = new Date(seg.start.getFullYear(), seg.start.getMonth(), seg.start.getDate(), 0,0,0,0);
  var end = seg.end ? new Date(seg.end.getFullYear(), seg.end.getMonth(), seg.end.getDate(), 0,0,0,0) : c;
  if (c.getTime() < s.getTime()) return 0;
  var e = end.getTime() < c.getTime() ? end : c;
  return PAYROLL_daysInclusive_(s, e);
}
// =========================================================
// ✅ 직위유지기간(누적): 동일 직위명(name) 여러 구간 합산
// - Employee_Position에서 같은 name이 여러 row일 수 있음(기간은 겹치지 않는다고 가정)
// - 공백/다른 직위 기간은 누적에 포함하지 않음
// - cutoff(날짜)까지의 누적 "일수"를 반환 (inclusive)
// =========================================================
function PAYROLL_positionCumDaysByName_(rows, positionName, cutoff){
  // ✅ 규칙(총근무연수 B안과 동일한 방식):
  // - 월초~월말을 모두 채우면: 1개월(=30일)로 누적
  // - 중도 시작/중도 종료(부분월): 실제 겹치는 "일수"만 누적
  positionName = String(positionName || '').trim();
  if (!positionName) return 0;
  if (!cutoff) return 0;

  var c = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate(), 0,0,0,0);

  // 1) 동일 직위명의 span 수집 (end 없으면 cutoff까지)
  var spans = [];
  (rows || []).forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    var nm = String(r.name || '').trim();
    if (nm !== positionName) return;

    var s = _parseYmdClamp_(r.start_date, 'start');
    if (!s) return;
    var e = _parseYmdClamp_(r.end_date, 'end');
    if (!e) e = c;

    var ss = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0);
    var ee = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0,0,0,0);
    if (ee.getTime() < ss.getTime()) return;
    if (ss.getTime() > c.getTime()) return;
    if (ee.getTime() > c.getTime()) ee = c;
    spans.push({ start: ss, end: ee });
  });
  if (!spans.length) return 0;

  // 2) 월 단위로 누적(만근이면 30일, 부분월이면 일수)
  //    시작월 = spans 중 가장 이른 start의 월
  var minStart = spans[0].start;
  for (var i=1; i<spans.length; i++){
    if (spans[i].start.getTime() < minStart.getTime()) minStart = spans[i].start;
  }

  var cur = new Date(minStart.getFullYear(), minStart.getMonth(), 1);
  var endMonth = new Date(c.getFullYear(), c.getMonth(), 1);

  var totalDays = 0;
  while (cur.getTime() <= endMonth.getTime()){
    var ms = new Date(cur.getFullYear(), cur.getMonth(), 1);
    var monthEndFull = new Date(cur.getFullYear(), cur.getMonth()+1, 0); // 말일
    var me = (monthEndFull.getTime() > c.getTime()) ? c : monthEndFull;  // cutoff로 clamp

    // 이 월 window(ms~me)에서 동일 직위 span의 합집합 겹침일수
    var union = PAYROLL_unionOverlapDays_(spans, ms, me);
    if (union > 0){
      // ✅ "만근=1개월"은 cutoff가 말일까지 포함될 때만 인정
      if (me.getTime() === monthEndFull.getTime()){
        var dim = PAYROLL_daysInclusive_(ms, monthEndFull);
        if (union >= dim){
          totalDays += 30; // 1개월로 고정
        } else {
          totalDays += union; // 부분월
        }
      } else {
        // cutoff로 잘린 달은 무조건 일수로만
        totalDays += union;
      }
    }

    cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
  }

  return totalDays;
}

// =========================================================
// ✅ 직무전문성(학력/자격) helpers
// - 결과: 미보유 / 석사보유 / 자격보유 / 전체보유
// - 규칙:
//   * 학력 시트(Education)에서 expertise_apply=해당 인 행들의 expertise_date 월부터 석사보유
//   * 자격 시트(Qualification)에서 expertise_apply=해당 인 행들의 expertise_date 월부터 자격보유
//   * 둘 다 활성화되면 전체보유
// =========================================================

function PAYROLL_isExpertiseApply_(v){
  // 허용: true, "true", "TRUE", "Y", "y", "1", 1, "해당"
  if (v === true) return true;
  if (v === 1) return true;
  var s = String(v == null ? '' : v).trim();
  if (!s) return false;
  s = s.toLowerCase();
  if (s === 'true' || s === 'y' || s === '1') return true;
  if (String(v).trim() === '해당') return true;
  return false;
}

function PAYROLL_monthIndex_(d){
  // d: Date
  return d.getFullYear() * 12 + d.getMonth(); // month: 0-based
}

function PAYROLL_firstApplyMonthIndex_(rows){
  // rows 중 (expertise_apply=해당 && expertise_date 유효) 의 "가장 이른" 월 index 반환
  var best = null;
  (rows || []).forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    if (!PAYROLL_isExpertiseApply_(r.expertise_apply)) return;
    var d = _parseYmdClamp_(r.expertise_date, 'start');
    if (!d) return;
    var mi = PAYROLL_monthIndex_(d);
    if (best == null || mi < best) best = mi;
  });
  return best; // null 가능
}

function PAYROLL_pickExpertiseCategory_(educationRows, qualificationRows, periodStart){
  // periodStart: 해당 월 1일(Date)
  var pm = PAYROLL_monthIndex_(periodStart);

  var eduM = PAYROLL_firstApplyMonthIndex_(educationRows);
  var quaM = PAYROLL_firstApplyMonthIndex_(qualificationRows);

  var hasEdu = (eduM != null) && (pm >= eduM);
  var hasQua = (quaM != null) && (pm >= quaM);

  if (hasEdu && hasQua) return '전체보유';
  if (hasEdu) return '석사보유';
  if (hasQua) return '자격보유';
  return '미보유';
}


/*function PAYROLL_pickExpertiseAt_(rows, atDate){
  // 반영일(<=시점) 중 가장 최신의 상태를 선택, 없으면 미보유
  var t = new Date(atDate.getFullYear(), atDate.getMonth(), atDate.getDate(), 0,0,0,0);
  var best = null;
  (rows||[]).forEach(function(r){
    if (!r) return;
    if (PAYROLL_isDeletedValue_(r.is_deleted)) return;
    // ✅ 호환키 제거: Expertise 표준 키만 사용
    var status = String(r.expertise || '').trim();
    if (!status) return;
    var d = _parseYmdClamp_(r.apply_date, 'start');
    if (!d) return;
    var dd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
    if (dd.getTime() > t.getTime()) return;
    if (!best || dd.getTime() > best.date.getTime()) best = { date: dd, status: status };
  });
  if (!best) return '미보유';
  // 허용값 외가 들어오면 그대로 노출(데이터 정합성 체크용)
  return best.status;
}*/

function PAYROLL_collectSpans_(employeeId, agreements, experiences, rangeEnd){
  // rangeEnd: 해당 월 말일(오픈엔드 보정용)
  var spans = [];
  employeeId = String(employeeId||'').trim();

  // 계약(Agreement)
  (agreements || []).forEach(function(a){
    if (!a) return;
    // ✅ 호환키 제거: Agreement 표준 키만 사용
    var s = _parseYmdClamp_(a.start_date, 'start');
    var e = _parseYmdClamp_(a.end_date, 'end');
    if (!s) return;
    var openEnd = false;
    if (!e) { openEnd = true; e = rangeEnd ? new Date(rangeEnd.getTime()) : new Date(); }
    spans.push({ type:'agreement', start:s, end:e, _open_end: openEnd });
  });

  // 내부경력(적용) (Experience)
  (experiences || []).forEach(function(x){
    if (!x) return;
    // ✅ 호환키 제거: Experience 표준 키만 사용
    var cat = String(x.category || '').trim();
    if (cat !== '내부경력(적용)') return;
    var s = _parseYmdClamp_(x.working_start_date, 'start');
    var e = _parseYmdClamp_(x.working_end_date, 'end');    if (!s) return;
    if (!e) e = rangeEnd ? new Date(rangeEnd.getTime()) : new Date();
    spans.push({ type:'experience_apply', start:s, end:e });
  });

  return spans;
}

function PAYROLL_mgmtWindow_(spans){
  if (!spans || !spans.length) return null;
  var minS = null, maxE = null;
  spans.forEach(function(sp){
    if (!sp || !sp.start || !sp.end) return;
    if (!minS || sp.start.getTime() < minS.getTime()) minS = sp.start;
    if (!maxE || sp.end.getTime() > maxE.getTime()) maxE = sp.end;
  });
  if (!minS || !maxE) return null;
  return { start:minS, end:maxE };
}

function PAYROLL_isWorkingInMonth_(spans, monthStart, monthEnd){
  for (var i=0; i<(spans||[]).length; i++){
    var sp = spans[i];
    if (!sp || !sp.start || !sp.end) continue;
    if (_overlap_(sp.start, sp.end, monthStart, monthEnd)) return true;
  }
  return false;
}

function PAYROLL_contractMinMax_(spans){
  // 계약(agreement)만 추출해서 min/max 반환 (없으면 null)
  var minS = null, maxE = null;
  (spans||[]).forEach(function(sp){
    if (!sp || sp.type !== 'agreement') return;
    if (!sp.start || !sp.end) return;
    if (!minS || sp.start.getTime() < minS.getTime()) minS = sp.start;
    if (!maxE || sp.end.getTime() > maxE.getTime()) maxE = sp.end;
  });
  return { start:minS, end:maxE };
}



function _fmtYmd_(d){
  if (!d) return '';
  var y = d.getFullYear();
  var m = d.getMonth()+1;
  var dd = d.getDate();
  return y + '-' + (m<10?('0'+m):m) + '-' + (dd<10?('0'+dd):dd);
}

function _overlapDaysInclusive_(aStart, aEnd, bStart, bEnd){
  if (!aStart) return 0;
  var s = aStart;
  var e = aEnd || bEnd;
  if (s < bStart) s = bStart;
  if (e > bEnd) e = bEnd;
  if (s > e) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

function _calcRate_(base, rate){
  base = Number(base || 0) || 0;
  rate = Number(rate || 0) || 0;
  if (!base || !rate) return 0;
  return Math.round(base * rate);
}

// =========================================================
// ✅ 퇴직금 "계약 연속 블록"의 시작월 기준 helpers
// =========================================================

function PAYROLL_contractBlockInfoInMonth_(agreements, ps, pe){
  // agreements: Employee_Agreement rows (해당 직원)
  // return: {start:Date, end:Date}  (현재월과 겹치는 "연속 계약 블록")
  if (!agreements || !agreements.length) return null;

  var spans = [];
  (agreements||[]).forEach(function(a){
    if (!a) return;
    if (a.is_deleted === true || a.is_deleted === 'true') return;
    var s = _parseYmdClamp_(a.start_date, 'start');
    var e = _parseYmdClamp_(a.end_date, 'end');
    if (!s) return;
    if (!e) e = pe; // 오픈엔드: 블록판정용으로 현재월말까지
    if (e.getTime() < s.getTime()) return;
    spans.push({ start:s, end:e });
  });
  if (!spans.length) return null;

  var merged = PAYROLL_mergeIntervals_(spans); // 하루 차이까지 연속 merge(이미 구현된 규칙)
  if (!merged.length) return null;

  // 현재월과 겹치는 블록 선택:
  // 1) pe(월말)를 포함하는 블록 우선
  // 2) 없으면 겹치는 블록 중 start가 가장 늦은 것
  var best = null;
  for (var i=0; i<merged.length; i++){
    var it = merged[i];
    if (!_overlap_(it.start, it.end, ps, pe)) continue;
    var containsEnd = (it.start.getTime() <= pe.getTime() && it.end.getTime() >= pe.getTime());
    if (containsEnd){
      if (!best || it.start.getTime() > best.start.getTime()) best = it;
    } else {
      if (!best) best = it;
      else {
        var bestContainsEnd = (best.start.getTime() <= pe.getTime() && best.end.getTime() >= pe.getTime());
        if (!bestContainsEnd && it.start.getTime() > best.start.getTime()) best = it;
      }
    }
  }
  if (!best) return null;
  return { start: best.start, end: best.end };
}

// =========================================================
// ✅ 퇴직금 도래월 트리거용: "관리기간(agreement + experience_apply)" 연속 블록
// - sevSpans: [{type,start,end,...}, ...] (이미 spans에서 추출)
// - merge 규칙: PAYROLL_mergeIntervals_ (하루 차이까지 연속)
// - 현재월과 겹치는 블록 선택 규칙은 계약 블록과 동일
// =========================================================
function PAYROLL_mgmtBlockInfoInMonth_(sevSpans, ps, pe){
  if (!sevSpans || !sevSpans.length) return null;

  var spans = [];
  (sevSpans||[]).forEach(function(sp){
    if (!sp || !sp.start || !sp.end) return;
    spans.push({ start: sp.start, end: sp.end });
  });
  if (!spans.length) return null;

  var merged = PAYROLL_mergeIntervals_(spans);
  if (!merged.length) return null;

  var best = null;
  for (var i=0; i<merged.length; i++){
    var it = merged[i];
    if (!_overlap_(it.start, it.end, ps, pe)) continue;

    var containsEnd = (it.start.getTime() <= pe.getTime() && it.end.getTime() >= pe.getTime());
    if (containsEnd){
      if (!best || it.start.getTime() > best.start.getTime()) best = it;
    } else {
      if (!best) best = it;
      else {
        var bestContainsEnd = (best.start.getTime() <= pe.getTime() && best.end.getTime() >= pe.getTime());
        if (!bestContainsEnd && it.start.getTime() > best.start.getTime()) best = it;
      }
    }
  }
  if (!best) return null;
  return { start: best.start, end: best.end };
}

function PAYROLL_monthsInclusive_(startDate, monthStart){
  // startDate의 "월"부터 monthStart의 "월"까지 inclusive 개월수
  if (!startDate || !monthStart) return 0;
  var sy = startDate.getFullYear(), sm = startDate.getMonth();   // 0-based
  var ty = monthStart.getFullYear(), tm = monthStart.getMonth(); // 0-based
  var a = sy*12 + sm;
  var b = ty*12 + tm;
  return (b - a) + 1;
}
