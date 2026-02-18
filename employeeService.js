/** employeeService.gs
 * Employee 번들 CRUD (1단계: replace-children 방식 + 소프트삭제)
 * - EMPLOYEE_list(payload)           // is_deleted 제외
 * - EMPLOYEE_getBundle(employeeId)   // is_deleted 제외 + bundle 최신 updated 계산(삭제 포함)
 * - EMPLOYEE_saveBundle(payload)     // 자식 diff-upsert (자식 변경으로 Employee.updated 터치 X)
 * - EMPLOYEE_deleteBundle(employeeId)// 마스터 소프트삭제(자식 유지)
 *
 * 전제:
 * - DB_SPREADSHEET_ID 전역 상수 존재
 * - 각 시트에 is_deleted 컬럼 추가(권장: 0/1)
 */

var EMPLOYEE_SHEET = 'Employee';
var EMPLOYEE_ID_FIELD = 'employee_id';

// ✅ 소프트삭제 컬럼명(전 시트 공통)
var EMP_SOFT_DELETE_FIELD = 'is_deleted';
// (선택) 있으면 자동 기록
var EMP_DELETED_AT_FIELD  = 'deleted_at';
var EMP_DELETED_BY_FIELD  = 'deleted_by';

var EMP_CHILDREN = [
  { entity:'Employee_Position',      sheet:'Employee_Position',      idField:'position_id',      parentField:'employee_id' },
  { entity:'Employee_Agreement',     sheet:'Employee_Agreement',     idField:'agreement_id',     parentField:'employee_id' },
  { entity:'Employee_Experience',    sheet:'Employee_Experience',    idField:'experience_id',    parentField:'employee_id' },
  { entity:'Employee_Education',     sheet:'Employee_Education',     idField:'education_id',     parentField:'employee_id' },
  { entity:'Employee_Training',      sheet:'Employee_Training',      idField:'training_id',      parentField:'employee_id' },
  { entity:'Employee_Qualification', sheet:'Employee_Qualification', idField:'qualification_id', parentField:'employee_id' },
  // ✅ 증빙자료(Drive 파일) - PK는 Drive file_id를 그대로 사용
  { entity:'Employee_File',          sheet:'Employee_File',          idField:'file_id',          parentField:'employee_id', manualPk:true }
];

// 문자열로 유지해야 하는 필드(사번/주민번호/전화/계좌/카드 등)
var EMP_TEXT_FIELDS = {
  employee_id:1,
  file_id:1,
  file_ext:1,
  personal_id:1,
  pesonal_id:1, // 오타 대응
  phone_number:1,
  company_number:1,
  email:1,
  salary_account:1,
  trip_account:1,
  company_card:1,
  company_card_account:1
};

// =========================
// 소프트삭제 유틸
// =========================
function EMP_isDeletedValue_(v){
  if (v === true) return true;
  if (v === 1) return true;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return false;
  return (s === '1' || s === 'true' || s === 'y' || s === 'yes' || s === '삭제' || s === 'deleted');
}
function EMP_normNotDeletedValue_(){
  return '0';
}
function EMP_normDeletedValue_(){
  return '1';
}

/* =========================
 * PATCH: 감사필드 메타(Date + actorLabel)
 * - at: Date 객체(시간 포함)로 저장
 * - by: "emp_id emp_name" 우선, 없으면 email fallback
 * ========================= */
function EMP_employeeMeta_(){
  var now = new Date();

  // 기본: 이메일
  var actorEmail = '';
  try { actorEmail = String(EMP_getActorEmail_() || '').trim(); } catch(e) {}

  // 우선: DB_actorLabel_(DB_getActor_()) -> "00000 가나다"
  var actorLabel = actorEmail;
  try{
    if (typeof DB_getActor_ === 'function' && typeof DB_actorLabel_ === 'function'){
      actorLabel = DB_actorLabel_(DB_getActor_()) || actorEmail;
    }
  }catch(e){
    actorLabel = actorEmail;
  }

  return {
    now: now, // ✅ Date 객체(시간 포함)
    nowYmd: Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd'), // 필요하면 UI용으로만
    actorEmail: actorEmail,
    actor: String(actorLabel || '').trim() // ✅ 저장용 라벨
  };
}

// ✅ 자식 시트인지 확인 (EMP_CHILDREN 정의 기반)
function EMP_getChildDefBySheet_(sheetName){
  sheetName = String(sheetName || '').trim();
  for (var i=0; i<EMP_CHILDREN.length; i++){
    if (EMP_CHILDREN[i].sheet === sheetName) return EMP_CHILDREN[i];
  }
  return null;
}

/**
 * ✅ Employee(마스터) updated_*만 갱신 (created_*는 절대 건드리지 않음)
 * - 현재 정책에서는 "Employee 자체 변경"일 때만 사용(자식 변경으로 호출하지 않음)
 */
function EMP_touchEmployeeUpdated_(employeeId, meta){
  employeeId = String(employeeId || '').trim();
  if (!employeeId) return false;
  meta = meta || EMP_employeeMeta_();

  // ✅ 수동 PK(child.manualPk) 테이블용: 빈 행 판단(파일행에서 file 선택 안한 상태 등)
  function _isBlankRow_(obj){
    obj = obj || {};
    var IGN = {
      created_at:1, created_by:1, updated_at:1, updated_by:1,
      deleted_at:1, deleted_by:1,
      is_deleted:1
    };
    if (child && child.parentField) IGN[child.parentField] = 1;
    if (child && child.idField) IGN[child.idField] = 1;

    var keys = Object.keys(obj);
    for (var i=0; i<keys.length; i++){
      var k = keys[i];
      if (IGN[k]) continue;

      var v = obj[k];
      if (v === true) return false;
      if (v == null) continue;
      if (typeof v === 'number' && !isNaN(v)) return false;

      var s = String(v).trim();
      if (s !== '') return false;
    }
    return true;
  }
  var sh = EMP_sh_(EMPLOYEE_SHEET);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);

  if (map['updated_at'] == null || map['updated_by'] == null) return false;

  // 삭제 포함으로 찾아서(restore/삭제 상태라도) updated는 찍을 수 있게
  var rowIndex = EMP_DB_findRowIndexById_(EMPLOYEE_SHEET, EMPLOYEE_ID_FIELD, employeeId, { includeDeleted:true });
  if (!rowIndex) return false;

  var lastCol = sh.getLastColumn();
  var row = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0];

  row[map['updated_at']] = meta.now;     // ✅ Date(시간 포함)
  row[map['updated_by']] = meta.actor;   // ✅ "00000 가나다"

  sh.getRange(rowIndex, 1, 1, lastCol).setValues([row]);
  return true;
}


// =========================
// Public APIs
// =========================
function EMPLOYEE_list(payload){
  var __perf = (typeof DB_perfStart_ === 'function')
    ? DB_perfStart_('EMPLOYEE_list')
    : null;
  var __perfMeta = { ok:false, total:0, rows:0 };
  try{
    payload = payload || {};
    var page = parseInt(payload.page || 1, 10) || 1;
    var pageSize = parseInt(payload.pageSize || 200, 10) || 200;

    var q = String(payload.q || '').trim().toLowerCase();
    var category = String(payload.category || '').trim();
    var status   = String(payload.status   || '').trim();
    var manage   = String(payload.manage   || '').trim();

    // ✅ 기본: 삭제행 제외
    var rows = EMP_DB_allObjects_(EMPLOYEE_SHEET, { includeDeleted:false });

    // ✅ (Project 정책 이식) is_visible=1 은 "UI 미표시" → 목록/집계 대상에서 완전 제외
    // - 컬럼이 없으면(legacy) 전체 표시
    rows = rows.filter(function(r){
      var v = (r && r.is_visible != null) ? String(r.is_visible).trim() : '0';
      return v !== '1';
    });

    // 필터
    rows = rows.filter(function(r){
      if (category && String(r.category || '').trim() !== category) return false;
      if (status   && String(r.status   || '').trim() !== status)   return false;
      if (manage   && String(r.manage   || '').trim() !== manage)   return false;

      if (q){
        var id   = String(r.employee_id || '').toLowerCase();
        var name = String(r.name || '').toLowerCase();
        var pid  = String(r.personal_id || r.pesonal_id || '').toLowerCase();
        if (id.indexOf(q) < 0 && name.indexOf(q) < 0 && pid.indexOf(q) < 0) return false;
      }
      return true;
    });

    var total = rows.length;
    var start = (page - 1) * pageSize;
    var out = rows.slice(start, start + pageSize);
    __perfMeta.ok = true;
    __perfMeta.total = total;
    __perfMeta.rows = out.length;

    return { ok:true, page:page, pageSize:pageSize, total:total, rows:out };

  }catch(err){
    return { ok:false, message: err && err.message ? err.message : String(err) };
  }finally{
    if (__perf && typeof DB_perfEnd_ === 'function') DB_perfEnd_(__perf, __perfMeta);
  }
}

/**
 * ✅ bundle 최신 updated(삭제 포함) 계산해서 내려줌
 * - employee: 삭제 제외(기본 정책)
 * - tables: 삭제 제외(기본 정책)
 * - bundle_updated_at/by/source: Employee + 자식(삭제 포함)에서 max(updated_at) / 그 행의 updated_by
 */
function EMPLOYEE_getBundle(employeeId){
  var __perf = (typeof DB_perfStart_ === 'function')
    ? DB_perfStart_('EMPLOYEE_getBundle')
    : null;
  var __perfMeta = { ok:false, tableRows:0 };
  try{
    // ✅ 권한: 소속인력 조회
    if (typeof DB_assertPerm_ === 'function') DB_assertPerm_('btn:employee:view');
   
    employeeId = String(employeeId || '').trim();
    if (!employeeId) return { ok:false, message:'employeeId가 없습니다.' };

    // ✅ 삭제행은 조회 불가(기본 정책)
    var employee = EMP_DB_getById_(EMPLOYEE_SHEET, EMPLOYEE_ID_FIELD, employeeId, { includeDeleted:false });
    if (!employee) return { ok:false, message:'직원 정보를 찾을 수 없습니다(삭제 포함): ' + employeeId };

    // ✅ is_visible=1 은 "UI 미표시" → 상세 조회도 불가(목록에서 클릭 자체가 없어야 함)
    if (employee.is_visible != null && String(employee.is_visible).trim() === '1'){
      return { ok:false, message:'직원 정보를 찾을 수 없습니다.' };
    }

    var tables = {};
    EMP_CHILDREN.forEach(function(c){
      // ✅ 자식도 삭제행 제외
      tables[c.entity] = EMP_DB_findByField_(c.sheet, c.parentField, employeeId, { includeDeleted:false });
    });

    // ✅ UI 표기용 최신 updated: Employee + 자식(삭제 포함)
    var bundleMeta = EMP_computeBundleUpdatedMeta_(employeeId);

    var out = {
      ok:true,
      employee: employee,
      tables: tables,

      // ✅ UI 표시용 (Employee.updated가 아니라 "bundle 기준")
      bundle_updated_at: bundleMeta.updated_at || '',
      bundle_updated_by: bundleMeta.updated_by || '',
      bundle_updated_source: bundleMeta.source || null
    };
    __perfMeta.ok = true;
    __perfMeta.tableRows = Object.keys(tables || {}).reduce(function(acc, k){
      var arr = tables[k];
      return acc + (Array.isArray(arr) ? arr.length : 0);
    }, 0);
    return out;

  }catch(err){
    return { ok:false, message: err && err.message ? err.message : String(err) };
  }finally{
    if (__perf && typeof DB_perfEnd_ === 'function') DB_perfEnd_(__perf, __perfMeta);
  }
}

/**
 * =========================================================
 * ✅ 소속인력 설정(관리 모달용)
 * - is_visible(0=활성/표시, 1=비활성/미표시): UI 목록에서 제외되는 상태
 * - is_deleted(소프트삭제): 삭제/복구 관리
 * =========================================================
 */
function EMPLOYEE_adminListVisibility(payload){
  try{
    DB_assertPerm_('btn:employee:create'); // Project 설정모달과 동일한 ACL 패턴
    payload = payload || {};

    var sh = EMP_sh_(EMPLOYEE_SHEET);
    var header = EMP_header_(sh);
    var map = EMP_hmap_(header);

    if (map['is_deleted'] == null) return { ok:false, message:'Employee 시트에 is_deleted 컬럼이 없습니다.' };
    if (map['is_visible'] == null) return { ok:false, message:'Employee 시트에 is_visible 컬럼이 없습니다.' };

    // includeDeleted:true 로 전부 가져와서 visible/deleted로 분리
    var all = EMP_DB_allObjects_(EMPLOYEE_SHEET, { includeDeleted:true }) || [];

    var visibleRows = [];
    var deletedRows = [];

    all.forEach(function(r){
      if (!r) return;
      var eid = String(r.employee_id || '').trim();
      if (!eid) return;
      var del = String(r.is_deleted || '').trim();
      if (del === '1') deletedRows.push(r);
      else visibleRows.push(r); // is_visible 0/1 모두 포함(설정에서 바꾸기 위함)
    });

    function cmp_(a,b){
      var ae = String(a.employee_id||'').trim();
      var be = String(b.employee_id||'').trim();
      var c = ae.localeCompare(be, 'ko', { numeric:true });
      if (c) return c;
      var an = String(a.name||'').trim();
      var bn = String(b.name||'').trim();
      return an.localeCompare(bn, 'ko', { numeric:true });
    }
    visibleRows.sort(cmp_);
    deletedRows.sort(cmp_);

    return _jsonSafeKst_({ ok:true, visibleRows:visibleRows, deletedRows:deletedRows });

  }catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  }
}

function EMPLOYEE_adminSaveVisibility(payload){
  try{
    var me = DB_assertPerm_('btn:employee:create');
    payload = payload || {};
    var visibles = Array.isArray(payload.visibles) ? payload.visibles : [];
    var restoreIds = Array.isArray(payload.restoreIds) ? payload.restoreIds : [];
    var hardDeleteIds = Array.isArray(payload.hardDeleteIds) ? payload.hardDeleteIds : [];
 

    var sh = EMP_sh_(EMPLOYEE_SHEET);
    var header = EMP_header_(sh);
    var map = EMP_hmap_(header);
    if (map['is_visible'] == null) return { ok:false, message:'Employee 시트에 is_visible 컬럼이 없습니다.' };
    if (map['is_deleted'] == null) return { ok:false, message:'Employee 시트에 is_deleted 컬럼이 없습니다.' };

    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      function _buildRowMapById_(){
        var out = {};
        var last = sh.getLastRow();
        if (last < 2) return out;
        var eidCol = map[EMPLOYEE_ID_FIELD] + 1;
        var vals = sh.getRange(2, eidCol, last - 1, 1).getValues();
        for (var i=0; i<vals.length; i++){
          var eid = String(vals[i][0] || '').trim();
          if (eid) out[eid] = i + 2;
        }
        return out;
      }

      // 2-1) ✅ (완전삭제 전) Employee_File에 연결된 Drive 파일 삭제
      // - 기본은 휴지통 이동(setTrashed)
      // - Advanced Drive API(Drive.Files.remove)가 켜져 있으면 영구삭제 시도
      function _driveRemoveById_(fileId){
        fileId = String(fileId || '').trim();
        if (!fileId) return;
        try{
          if (typeof Drive !== 'undefined' && Drive.Files && typeof Drive.Files.remove === 'function'){
            Drive.Files.remove(fileId); // Advanced Drive API가 켜진 경우: 영구삭제
            return;
          }
        }catch(e){
          // 영구삭제 실패 시 휴지통으로 fallback
        }
        try{
          DriveApp.getFileById(fileId).setTrashed(true); // 기본: 휴지통 이동
        }catch(e2){
          // 이미 삭제/권한없음/ID오류 등은 무시(행 삭제는 계속 진행)
        }
      }

      function _deleteDriveFilesForEmployee_(employeeId){
        employeeId = String(employeeId || '').trim();
        if (!employeeId) return;
        try{
          var fsh = EMP_sh_('Employee_File');
          var fheader = EMP_header_(fsh);
          var fmap = EMP_hmap_(fheader);
          if (fmap['employee_id'] == null || fmap['file_id'] == null) return;
          var last = fsh.getLastRow();
          if (last < 2) return;
          var values = fsh.getRange(2, 1, last - 1, fheader.length).getValues();
          for (var i=0; i<values.length; i++){
            var row = values[i];
            var eid = String(row[fmap['employee_id']] || '').trim();
            if (eid !== employeeId) continue;
            var fileId = String(row[fmap['file_id']] || '').trim();
            if (fileId) _driveRemoveById_(fileId);
          }
        }catch(e){
          // Drive 삭제 실패가 있어도 DB 하드삭제는 계속 진행
        }
      }

      // 2-2) ✅ 완전삭제: master + children(행 자체 삭제) + Drive 파일 삭제
      function _hardDeleteBundle_(employeeId){
        employeeId = String(employeeId || '').trim();
        if (!employeeId) return;

        // (1) Drive 파일 먼저 삭제 (Employee_File 시트 기반)
        _deleteDriveFilesForEmployee_(employeeId);

        // (2) children 행 삭제
        EMP_CHILDREN.forEach(function(ch){
          EMP_DB_deleteWhere_(ch.sheet, ch.parentField, employeeId);
        });

        // (3) master 행 삭제
        EMP_DB_deleteWhere_(EMPLOYEE_SHEET, EMPLOYEE_ID_FIELD, employeeId);
      }

      // hardDeleteIds가 restoreIds에 같이 들어온 경우 hard 우선
      if (hardDeleteIds && hardDeleteIds.length){
        var hardMap = {};
        hardDeleteIds.forEach(function(x){
          x = String(x || '').trim();
          if (x) hardMap[x] = 1;
        });
        restoreIds = (restoreIds || []).filter(function(x){
          x = String(x || '').trim();
          return x && !hardMap[x];
        });
      }

      // ✅ 하드삭제 실행
      hardDeleteIds.forEach(function(eid){
        eid = String(eid || '').trim();
        if (!eid) return;
        _hardDeleteBundle_(eid);
      });

      var rowMap = _buildRowMapById_();
      var last = sh.getLastRow();
      var values = (last >= 2) ? sh.getRange(2, 1, last - 1, header.length).getValues() : [];
      var now = new Date();
      var actor = DB_actorLabel_(me);
      var changedMaster = false;

      // 1) is_visible 저장 (삭제되지 않은 행만)
      visibles.forEach(function(it){
        var eid = String(it && it.employee_id || '').trim();
        if (!eid) return;
        var rowNo = rowMap[eid] || 0;
        if (!rowNo) return;
        var idx = rowNo - 2;
        if (idx < 0 || idx >= values.length) return;
        var row = values[idx];
        if (String(row[map['is_deleted']] || '').trim() === '1') return;

        var v = (it && (it.is_visible === 1 || it.is_visible === '1')) ? 1 : 0;
        if (String(row[map['is_visible']] || '') !== String(v)) {
          row[map['is_visible']] = v;
          changedMaster = true;
        }
        if (map['updated_at'] != null) { row[map['updated_at']] = now; changedMaster = true; }
        if (map['updated_by'] != null) { row[map['updated_by']] = actor; changedMaster = true; }
      });

      restoreIds.forEach(function(eid){
        eid = String(eid || '').trim();
        if (!eid) return;
        var rowNo = rowMap[eid] || 0;
        if (!rowNo) return;
        var idx = rowNo - 2;
        if (idx < 0 || idx >= values.length) return;
        var row = values[idx];
        if (String(row[map['is_deleted']] || '').trim() !== '0') {
          row[map['is_deleted']] = 0;
          changedMaster = true;
        }
        if (map['updated_at'] != null) { row[map['updated_at']] = now; changedMaster = true; }
        if (map['updated_by'] != null) { row[map['updated_by']] = actor; changedMaster = true; }
      });
      if (changedMaster && values.length) sh.getRange(2, 1, values.length, header.length).setValues(values);

      if (typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Employee');
      return _jsonSafeKst_({ ok:true });
    } finally {
      lock.releaseLock();
    }
  }catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  }
}

function EMP_DB_upsertChildren_(child, employeeId, rowsFromClient, meta){
  var changed = 0;

  rowsFromClient = Array.isArray(rowsFromClient) ? rowsFromClient : [];

  meta = meta || EMP_employeeMeta_();

  // ✅ 비교키 준비 (시트 헤더 기반, 시스템필드 제외)
  var ignoreMap = EMP_buildIgnoreMap_(child);
  var compareKeys = EMP_getCompareKeysBySheet_(child.sheet, ignoreMap);

  // 1) 기존(삭제 포함) 자식 목록 로드
  var existingAny = EMP_DB_findByField_(child.sheet, child.parentField, employeeId, { includeDeleted:true }) || [];
  var existingMap = {};
  existingAny.forEach(function(r){
    var id = String(r[child.idField] || '').trim();
    if (id) existingMap[id] = r;
  });

  // 2) 이번 payload에 포함된 ID set
  var keepIds = {};
  rowsFromClient.forEach(function(r){
    var id = String((r||{})[child.idField] || '').trim();
    if (id) keepIds[id] = true;
  });

  // 3) payload rows upsert
  rowsFromClient.forEach(function(r){
    r = r || {};
    r[child.parentField] = employeeId;

    var pk = String(r[child.idField] || '').trim();

    // (A) 신규 처리
    if (!pk){
      // ✅ Employee_File 등: PK를 자동발급하지 않고(Drive file_id 사용) 저장 단계에서 검증
      if (child && child.manualPk){
        // 파일 미선택(빈행)이면 그냥 무시
        if (_isBlankRow_(r)) return;
        throw new Error(child.sheet + ' 저장 오류: 파일을 선택하세요.');
      }

      pk = String(EMP_DB_nextIntId_(child.sheet, child.idField));
      r[child.idField] = pk;

      r.created_at = meta.now;
      r.created_by = meta.actor;
      r.updated_at = meta.now;
      r.updated_by = meta.actor;
      r[EMP_SOFT_DELETE_FIELD] = EMP_normNotDeletedValue_();

      EMP_DB_appendRow_(child.sheet, r, EMP_TEXT_FIELDS);
      changed++; // ✅ insert 발생
      return;
    }

    // (B) 기존이 있으면 diff 판단 후 update/skip (삭제된 행도 복원 가능)
    var old = existingMap[pk];

    if (old){
      var wasDeleted = EMP_isDeletedValue_(old[EMP_SOFT_DELETE_FIELD]);

      // ✅ diff 비교: (삭제상태였다면 restore이므로 무조건 update)
      var hasDiff = wasDeleted || EMP_hasDiffByKeys_(old, r, compareKeys);

      if (!hasDiff){
        // ✅ 값 동일하면 update 스킵 → updated_* 유지
        return;
      }

      // update payload 구성: created_*는 건드리지 않음
      var upd = {};
      Object.keys(r).forEach(function(k){ upd[k] = r[k]; });

      upd.updated_at = meta.now;
      upd.updated_by = meta.actor;
      upd[EMP_SOFT_DELETE_FIELD] = EMP_normNotDeletedValue_();

      // ✅ 복원 시 deleted_* 비우기(컬럼이 있으면)
      if (wasDeleted){
        if (EMP_DELETED_AT_FIELD) upd[EMP_DELETED_AT_FIELD] = '';
        if (EMP_DELETED_BY_FIELD) upd[EMP_DELETED_BY_FIELD] = '';
      }

      EMP_DB_updateById_(child.sheet, child.idField, pk, upd, EMP_TEXT_FIELDS, { includeDeleted:true });
      changed++; // ✅ update 발생
      return;
    }

    // (C) DB에 없는데 pk가 있다면(클라가 임의 ID 준 경우) insert로 처리
    r.created_at = meta.now;
    r.created_by = meta.actor;
    r.updated_at = meta.now;
    r.updated_by = meta.actor;
    r[EMP_SOFT_DELETE_FIELD] = EMP_normNotDeletedValue_();

    EMP_DB_appendRow_(child.sheet, r, EMP_TEXT_FIELDS);
    changed++; // ✅ insert 발생
  });

  // 4) 기존 행 중 payload에 없는 것만 soft delete (active만)
  existingAny.forEach(function(old){
    var pk = String(old[child.idField] || '').trim();
    if (!pk) return;
    if (keepIds[pk]) return; // 유지
    if (EMP_isDeletedValue_(old[EMP_SOFT_DELETE_FIELD])) return; // 이미 삭제면 스킵

    EMP_DB_softDeleteById_(child.sheet, child.idField, pk, meta);
    changed++; // ✅ delete 발생
  });

  return changed;
}


function EMPLOYEE_saveBundle(payload){
  try{
    payload = payload || {};
    var modeFromClient = String(payload._mode || '').trim(); // create/edit (프론트가 넣음)
    var meta = EMP_employeeMeta_();

    var emp = payload.employee || {};
    var employeeId = String(emp.employee_id || '').trim();
    if (!employeeId) return { ok:false, message:'사번(employee_id)은 필수입니다.' };
    if (!String(emp.name || '').trim()) return { ok:false, message:'성명(name)은 필수입니다.' };

    // employee_id는 "텍스트"로 강제
    emp.employee_id = employeeId;

    // ✅ 존재 체크: 활성/삭제포함
    var oldAny    = EMP_DB_getById_(EMPLOYEE_SHEET, EMPLOYEE_ID_FIELD, employeeId, { includeDeleted:true  });
    var oldActive = EMP_DB_getById_(EMPLOYEE_SHEET, EMPLOYEE_ID_FIELD, employeeId, { includeDeleted:false });

    var existsAny = !!oldAny;
    var existsActive = !!oldActive;

    // 서버 기준 모드 결정
    var actualMode = existsActive ? 'edit' : (existsAny ? 'restore' : 'create');
    // ✅ 권한: 서버 판정 모드 기준으로 강제
    if (typeof DB_assertPerm_ === 'function'){
      DB_assertPerm_(actualMode === 'create' ? 'btn:employee:create' : 'btn:employee:update');
    }
   
    var masterChanged = (!existsAny) ? true : EMP_masterHasDiff_(oldActive || oldAny || {}, emp);

    // created_*/updated_*는 서버가 관리(프론트 값은 무시)
    if (!existsAny){
      emp.created_at = meta.now;   // ✅ Date(시간 포함)
      emp.created_by = meta.actor; // ✅ "emp_id emp_name"
    } else {
      delete emp.created_at;
      delete emp.created_by;
    }

    if (masterChanged || actualMode === 'restore'){
      emp.updated_at = meta.now;
      emp.updated_by = meta.actor;
    } else {
      delete emp.updated_at;
      delete emp.updated_by;
    }

    // ✅ 소프트삭제 해제(restore 포함)
    emp[EMP_SOFT_DELETE_FIELD] = EMP_normNotDeletedValue_();

    // 마스터 upsert
    if (!existsAny){
      EMP_DB_insertRow_(EMPLOYEE_SHEET, emp, EMP_TEXT_FIELDS);
      masterChanged = true;
    }else{
      if (actualMode === 'restore'){
        emp.updated_at = meta.now;
        emp.updated_by = meta.actor;
        EMP_DB_updateById_(EMPLOYEE_SHEET, EMPLOYEE_ID_FIELD, employeeId, emp, EMP_TEXT_FIELDS, { includeDeleted:true });
        masterChanged = true;
      } else {
        if (masterChanged){
          EMP_DB_updateById_(EMPLOYEE_SHEET, EMPLOYEE_ID_FIELD, employeeId, emp, EMP_TEXT_FIELDS, { includeDeleted:true });
        }
      }
    }

    // ✅ 자식 테이블 diff-upsert
    // - tables에 entity가 "없으면" 그 테이블은 건드리지 않음(안전)
    var tables = payload.tables || {};
    EMP_CHILDREN.forEach(function(c){
      if (!tables.hasOwnProperty(c.entity)) return;
      var rows = Array.isArray(tables[c.entity]) ? tables[c.entity] : [];
      EMP_DB_upsertChildren_(c, employeeId, rows, meta);
    });

    // ✅ 핵심 정책:
    // - 자식 변경이 있어도 Employee.updated_*는 갱신하지 않는다.
    // - UI는 EMPLOYEE_getBundle()에서 bundle_updated_*로 계산해 보여준다.

    if (typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Employee');
    return { ok:true, mode: actualMode, employee_id: employeeId };

  }catch(err){
    return { ok:false, message: err && err.message ? err.message : String(err) };
  }
}

function EMPLOYEE_deleteBundle(employeeId){
  try{
    // ✅ 권한: 소속인력 삭제
    if (typeof DB_assertPerm_ === 'function') DB_assertPerm_('btn:employee:delete');

    employeeId = String(employeeId || '').trim();
    if (!employeeId) return { ok:false, message:'employee_id가 없습니다.' };

    var meta = EMP_employeeMeta_();

    // ✅ 마스터만 소프트삭제
    // - 자식은 유지한다.
    // - 자식의 is_deleted는 "자식 자체 삭제"에서만 변경되도록 분리
    EMP_DB_softDeleteById_(EMPLOYEE_SHEET, EMPLOYEE_ID_FIELD, employeeId, meta);

    if (typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Employee');
    return { ok:true };

  }catch(err){
    return { ok:false, message: err && err.message ? err.message : String(err) };
  }
}

// =========================
// DB Helper (employeeService 내부 전용)
// =========================
function EMP_ss_(){
  return SpreadsheetApp.openById(DB_SPREADSHEET_ID);
}
function EMP_sh_(name){
  var sh = EMP_ss_().getSheetByName(name);
  if (!sh) throw new Error('시트를 찾을 수 없습니다: ' + name);
  return sh;
}
function EMP_header_(sh){
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1,1,1,lastCol).getValues()[0] || [];
}
function EMP_hmap_(header){
  var m = {};
  for (var i=0; i<header.length; i++){
    var k = String(header[i] || '').trim();
    if (k) m[k] = i; // 0-based
  }
  return m;
}
function EMP_nowYmd_(){
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}
function EMP_getActorEmail_(){
  try{
    if (typeof getActorEmail_ === 'function'){
      return String(getActorEmail_() || '').trim();
    }
  }catch(e){}
  try{
    return String(Session.getActiveUser().getEmail() || '').trim();
  }catch(e){}
  return '';
}

// ✅ 전체 읽기(기본: 삭제행 제외)
function EMP_DB_allObjects_(sheetName, opts){
  opts = opts || {};
  var includeDeleted = !!opts.includeDeleted;

  var sh = EMP_sh_(sheetName);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);
  var values = sh.getRange(2,1,lastRow-1,lastCol).getValues();

  var out = [];
  for (var r=0; r<values.length; r++){
    var row = values[r];
    var obj = {};
    var any = false;

    for (var c=0; c<header.length; c++){
      var key = String(header[c]||'').trim();
      if (!key) continue;
      var v = row[c];
      if (v !== '' && v != null) any = true;

      // Date -> ymd (기존 정책 유지)
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
        v = Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
      }
      obj[key] = v;
    }
    if (!any) continue;

    if (!includeDeleted && map[EMP_SOFT_DELETE_FIELD] != null){
      if (EMP_isDeletedValue_(obj[EMP_SOFT_DELETE_FIELD])) continue;
    }

    out.push(obj);
  }
  return out;
}

// ✅ 필드 검색(기본: 삭제행 제외)
function EMP_DB_findByField_(sheetName, field, value, opts){
  opts = opts || {};
  var includeDeleted = !!opts.includeDeleted;

  value = String(value || '').trim();
  if (!value) return [];

  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);
  if (map[field] == null) throw new Error('필드를 찾을 수 없습니다: '+field+' in '+sheetName);

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];

  var values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  var out = [];

  for (var i=0; i<values.length; i++){
    var row = values[i];

    var cell = row[map[field]];
    if (String(cell || '').trim() !== value) continue;

    if (!includeDeleted && map[EMP_SOFT_DELETE_FIELD] != null){
      var delVal = row[map[EMP_SOFT_DELETE_FIELD]];
      if (EMP_isDeletedValue_(delVal)) continue;
    }

    var obj = {};
    for (var c=0; c<header.length; c++){
      var k = String(header[c]||'').trim();
      if (!k) continue;
      var v = row[c];
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
        v = Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
      }
      obj[k] = v;
    }
    out.push(obj);
  }
  return out;
}

function EMP_DB_getById_(sheetName, idField, idValue, opts){
  opts = opts || {};
  var includeDeleted = !!opts.includeDeleted;

  var idx = EMP_DB_findRowIndexById_(sheetName, idField, idValue, { includeDeleted: includeDeleted });
  if (!idx) return null;

  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var lastCol = sh.getLastColumn();
  var row = sh.getRange(idx, 1, 1, lastCol).getValues()[0];

  var obj = {};
  for (var c=0; c<header.length; c++){
    var k = String(header[c]||'').trim();
    if (!k) continue;
    var v = row[c];
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
      v = Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
    }
    obj[k] = v;
  }

  if (!includeDeleted && EMP_isDeletedValue_(obj[EMP_SOFT_DELETE_FIELD])) return null;

  return obj;
}

// 반환: 시트상의 "실제 row index(1-based)" 또는 null
function EMP_DB_findRowIndexById_(sheetName, idField, idValue, opts){
  opts = opts || {};
  var includeDeleted = !!opts.includeDeleted;

  idValue = String(idValue || '').trim();
  if (!idValue) return null;

  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);
  if (map[idField] == null) throw new Error('ID field not found: '+idField+' in '+sheetName);

  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  var idCol = map[idField] + 1;
  var idVals = sh.getRange(2, idCol, lastRow-1, 1).getValues();

  var delCol = (map[EMP_SOFT_DELETE_FIELD] != null) ? (map[EMP_SOFT_DELETE_FIELD] + 1) : null;
  var delVals = null;

  if (!includeDeleted && delCol){
    delVals = sh.getRange(2, delCol, lastRow-1, 1).getValues();
  }

  for (var i=0; i<idVals.length; i++){
    if (String(idVals[i][0] || '').trim() !== idValue) continue;

    if (!includeDeleted && delVals){
      if (EMP_isDeletedValue_(delVals[i][0])) continue;
    }

    return i + 2; // 실제 row index
  }
  return null;
}

function EMP_DB_insertRow_(sheetName, obj, textFields){
  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);

  if (map[EMP_SOFT_DELETE_FIELD] != null && obj[EMP_SOFT_DELETE_FIELD] == null){
    obj[EMP_SOFT_DELETE_FIELD] = EMP_normNotDeletedValue_();
  }

  var row = new Array(header.length);
  for (var c=0; c<header.length; c++){
    var k = String(header[c]||'').trim();
    if (!k) continue;
    row[c] = (obj[k] == null) ? '' : obj[k];
  }

  var r = sh.getLastRow() + 1;
  sh.getRange(r,1,1,header.length).setValues([row]);

  EMP_DB_applyTextFormat_(sh, r, map, textFields);
  return r;
}

function EMP_DB_appendRow_(sheetName, obj, textFields){
  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);

  if (map[EMP_SOFT_DELETE_FIELD] != null && obj[EMP_SOFT_DELETE_FIELD] == null){
    obj[EMP_SOFT_DELETE_FIELD] = EMP_normNotDeletedValue_();
  }

  var row = new Array(header.length);
  for (var c=0; c<header.length; c++){
    var k = String(header[c]||'').trim();
    if (!k) continue;
    row[c] = (obj[k] == null) ? '' : obj[k];
  }

  var r = sh.getLastRow() + 1;
  sh.getRange(r,1,1,header.length).setValues([row]);
  EMP_DB_applyTextFormat_(sh, r, map, textFields);

  return r;
}

function EMP_DB_updateById_(sheetName, idField, idValue, obj, textFields, opts){
  opts = opts || {};
  var includeDeleted = !!opts.includeDeleted;

  var rowIndex = EMP_DB_findRowIndexById_(sheetName, idField, idValue, { includeDeleted: includeDeleted });
  if (!rowIndex) throw new Error('수정 대상이 없습니다: '+idValue+' in '+sheetName);

  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);

  var lastCol = sh.getLastColumn();
  var row = sh.getRange(rowIndex,1,1,lastCol).getValues()[0];

  Object.keys(obj || {}).forEach(function(k){
    if (map[k] == null) return;
    row[map[k]] = (obj[k] == null) ? '' : obj[k];
  });

  sh.getRange(rowIndex,1,1,lastCol).setValues([row]);
  EMP_DB_applyTextFormat_(sh, rowIndex, map, textFields);

  return rowIndex;
}

// =========================
// ✅ 소프트삭제 구현부
// =========================
function EMP_DB_softDeleteById_(sheetName, idField, idValue, meta){
  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);

  if (map[EMP_SOFT_DELETE_FIELD] == null){
    EMP_DB_deleteById_(sheetName, idField, idValue);
    return true;
  }

  var rowIndex = EMP_DB_findRowIndexById_(sheetName, idField, idValue, { includeDeleted:true });
  if (!rowIndex) return false;

  var lastCol = sh.getLastColumn();
  var row = sh.getRange(rowIndex,1,1,lastCol).getValues()[0];

  row[map[EMP_SOFT_DELETE_FIELD]] = EMP_normDeletedValue_();

  if (map['updated_at'] != null) row[map['updated_at']] = meta.now;
  if (map['updated_by'] != null) row[map['updated_by']] = meta.actor;

  if (map[EMP_DELETED_AT_FIELD] != null) row[map[EMP_DELETED_AT_FIELD]] = meta.now;
  if (map[EMP_DELETED_BY_FIELD] != null) row[map[EMP_DELETED_BY_FIELD]] = meta.actor;

  sh.getRange(rowIndex,1,1,lastCol).setValues([row]);
  return true;
}

function EMP_DB_softDeleteWhere_(sheetName, field, value, meta){
  value = String(value || '').trim();
  if (!value) return 0;

  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);

  if (map[EMP_SOFT_DELETE_FIELD] == null){
    EMP_DB_deleteWhere_(sheetName, field, value);
    return 0;
  }
  if (map[field] == null) throw new Error('필드를 찾을 수 없습니다: '+field+' in '+sheetName);

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return 0;

  var values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  var changed = 0;

  for (var i=0; i<values.length; i++){
    var row = values[i];
    if (String(row[map[field]] || '').trim() !== value) continue;

    row[map[EMP_SOFT_DELETE_FIELD]] = EMP_normDeletedValue_();

    if (map['updated_at'] != null) row[map['updated_at']] = meta.now;
    if (map['updated_by'] != null) row[map['updated_by']] = meta.actor;

    if (map[EMP_DELETED_AT_FIELD] != null) row[map[EMP_DELETED_AT_FIELD]] = meta.now;
    if (map[EMP_DELETED_BY_FIELD] != null) row[map[EMP_DELETED_BY_FIELD]] = meta.actor;

    changed++;
  }

  if (changed){
    sh.getRange(2,1,lastRow-1,lastCol).setValues(values);
  }
  return changed;
}

// =========================
// (fallback) 기존 하드삭제 함수들
// =========================
function EMP_DB_deleteById_(sheetName, idField, idValue){
  var idx = EMP_DB_findRowIndexById_(sheetName, idField, idValue, { includeDeleted:true });
  if (!idx) return false;
  EMP_sh_(sheetName).deleteRow(idx);
  return true;
}

function EMP_DB_deleteWhere_(sheetName, field, value){
  value = String(value || '').trim();
  if (!value) return;

  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);
  if (map[field] == null) throw new Error('필드를 찾을 수 없습니다: '+field+' in '+sheetName);

  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  var col = map[field] + 1;
  var vals = sh.getRange(2, col, lastRow-1, 1).getValues();

  for (var i=vals.length-1; i>=0; i--){
    if (String(vals[i][0] || '').trim() === value){
      sh.deleteRow(i + 2);
    }
  }
}

function EMP_DB_nextIntId_(sheetName, idField){
  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);
  if (map[idField] == null) throw new Error('ID field not found: '+idField+' in '+sheetName);

  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 1;

  var col = map[idField] + 1;
  var vals = sh.getRange(2, col, lastRow-1, 1).getValues();

  var max = 0;
  for (var i=0; i<vals.length; i++){
    var n = parseInt(vals[i][0], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

function EMP_DB_applyTextFormat_(sh, rowIndex, headerMap, textFields){
  if (!textFields) return;
  Object.keys(textFields).forEach(function(k){
    if (headerMap[k] == null) return;
    var col = headerMap[k] + 1;
    try{
      sh.getRange(rowIndex, col, 1, 1).setNumberFormat('@');
    }catch(e){}
  });
}

/* =========================================================
 * PATCH(A): Diff Compare Utils
 * - "변경된 행만 update"를 위해 old vs payload 비교
 * ========================================================= */

function EMP_normCmp_(v){
  if (v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
    return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function EMP_buildIgnoreMap_(child){
  var ig = {
    created_at:1, created_by:1, updated_at:1, updated_by:1,
    deleted_at:1, deleted_by:1,
    is_deleted:1
  };
  if (child && child.parentField) ig[child.parentField] = 1;
  if (child && child.idField) ig[child.idField] = 1;
  return ig;
}

function EMP_getCompareKeysBySheet_(sheetName, ignoreMap){
  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var keys = [];
  for (var i=0; i<header.length; i++){
    var k = String(header[i] || '').trim();
    if (!k) continue;
    if (ignoreMap && ignoreMap[k]) continue;
    keys.push(k);
  }
  return keys;
}

function EMP_hasDiffByKeys_(oldRow, newRow, keys){
  oldRow = oldRow || {};
  newRow = newRow || {};
  for (var i=0; i<keys.length; i++){
    var k = keys[i];
    var oldV = oldRow[k];
    var newV = (newRow.hasOwnProperty(k) ? newRow[k] : oldV);
    if (EMP_normCmp_(oldV) !== EMP_normCmp_(newV)) return true;
  }
  return false;
}

function EMP_masterHasDiff_(oldRow, newRow){
  oldRow = oldRow || {};
  newRow = newRow || {};

  var ignore = {
    created_at:1, created_by:1, updated_at:1, updated_by:1,
    deleted_at:1, deleted_by:1,
    is_deleted:1
  };
  ignore[EMPLOYEE_ID_FIELD] = 1;

  var keys = EMP_getCompareKeysBySheet_(EMPLOYEE_SHEET, ignore);

  for (var i=0; i<keys.length; i++){
    var k = keys[i];
    if (!newRow.hasOwnProperty(k)) continue;
    if (EMP_normCmp_(oldRow[k]) !== EMP_normCmp_(newRow[k])) return true;
  }
  return false;
}

/* =========================================================
 * PATCH(Final): Bundle 최신 updated 계산 (삭제 포함)
 * - UI 표시용 updated_*는 번들(Employee + 자식, 삭제 포함)에서 max(updated_at)
 * ========================================================= */

function EMP_toDate_(v){
  if (v == null || v === '') return null;

  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return v;

  if (typeof v === 'number'){
    var dnum = new Date(v);
    return isNaN(dnum.getTime()) ? null : dnum;
  }

  var s = String(v || '').trim();
  if (!s) return null;

  var m = s.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m){
    var yy = parseInt(m[1],10);
    var mo = parseInt(m[2],10)-1;
    var dd = parseInt(m[3],10);
    var hh = parseInt(m[4]||'0',10);
    var mi = parseInt(m[5]||'0',10);
    var ss = parseInt(m[6]||'0',10);
    var d = new Date(yy, mo, dd, hh, mi, ss);
    return isNaN(d.getTime()) ? null : d;
  }

  var d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function EMP_fmtDateTime_(d){
  if (!d || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * RAW 조회: Date는 Date 그대로(시간 포함) 유지
 * - includeDeleted 옵션 적용
 */
function EMP_DB_findByFieldRaw_(sheetName, field, value, opts){
  opts = opts || {};
  var includeDeleted = !!opts.includeDeleted;

  value = String(value || '').trim();
  if (!value) return [];

  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var map = EMP_hmap_(header);

  if (map[field] == null) throw new Error('필드를 찾을 수 없습니다: '+field+' in '+sheetName);

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];

  var values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  var out = [];

  for (var i=0; i<values.length; i++){
    var row = values[i];

    var cell = row[map[field]];
    if (String(cell || '').trim() !== value) continue;

    if (!includeDeleted && map[EMP_SOFT_DELETE_FIELD] != null){
      var delVal = row[map[EMP_SOFT_DELETE_FIELD]];
      if (EMP_isDeletedValue_(delVal)) continue;
    }

    var obj = {};
    for (var c=0; c<header.length; c++){
      var k = String(header[c]||'').trim();
      if (!k) continue;
      obj[k] = row[c]; // ✅ RAW
    }
    out.push(obj);
  }

  return out;
}

function EMP_DB_getByIdRaw_(sheetName, idField, idValue, opts){
  opts = opts || {};
  var includeDeleted = !!opts.includeDeleted;

  var idx = EMP_DB_findRowIndexById_(sheetName, idField, idValue, { includeDeleted: includeDeleted });
  if (!idx) return null;

  var sh = EMP_sh_(sheetName);
  var header = EMP_header_(sh);
  var lastCol = sh.getLastColumn();
  var row = sh.getRange(idx, 1, 1, lastCol).getValues()[0];

  var obj = {};
  for (var c=0; c<header.length; c++){
    var k = String(header[c]||'').trim();
    if (!k) continue;
    obj[k] = row[c]; // ✅ RAW
  }

  if (!includeDeleted && EMP_isDeletedValue_(obj[EMP_SOFT_DELETE_FIELD])) return null;
  return obj;
}

/**
 * ✅ 번들의 최신 updated 계산
 * - 후보: Employee(삭제 포함) + 자식(employee_id 매칭, 삭제 포함)
 * - 비교: updated_at 우선, 없으면 created_at fallback
 * - 결과: 최신 updated_at(문자열) + 그 행의 updated_by
 */
function EMP_computeBundleUpdatedMeta_(employeeId){
  employeeId = String(employeeId || '').trim();
  if (!employeeId) return { updated_at:'', updated_by:'', source:null };

  var best = null;

  function considerRow(row, source){
    if (!row) return;

    var dt =
      EMP_toDate_(row.updated_at) ||
      EMP_toDate_(row.created_at);

    if (!dt) return;

    var by =
      String(row.updated_by || row.created_by || '').trim();

    var ts = dt.getTime();

    if (!best || ts > best.ts){
      best = {
        ts: ts,
        dt: dt,
        by: by,
        source: source || null
      };
    }
  }

  // 1) Employee(삭제 포함)
  var empRaw = EMP_DB_getByIdRaw_(EMPLOYEE_SHEET, EMPLOYEE_ID_FIELD, employeeId, { includeDeleted:true });
  considerRow(empRaw, { sheet: EMPLOYEE_SHEET, idField: EMPLOYEE_ID_FIELD, id: employeeId });

  // 2) 자식(삭제 포함)
  EMP_CHILDREN.forEach(function(c){
    var rows = EMP_DB_findByFieldRaw_(c.sheet, c.parentField, employeeId, { includeDeleted:true }) || [];
    rows.forEach(function(r){
      var rid = String(r[c.idField] || '').trim();
      considerRow(r, { sheet: c.sheet, idField: c.idField, id: rid || '' });
    });
  });

  if (!best){
    return { updated_at:'', updated_by:'', source:null };
  }

  return {
    updated_at: EMP_fmtDateTime_(best.dt),
    updated_by: best.by,
    source: best.source
  };
}

// =========================
// ✅ Employee 탭(목록) 프리로드
// - Project와 동일 패턴: 마스터 목록 + 하위테이블을 한 번에 내려줌
// - 프론트는 서버 추가호출 없이 필터/탭 렌더링
// =========================
function EMPLOYEE_listTabs(payload){
  try{
    DB_assertPerm_('page:employee:view');

    payload = payload || {};

    // 1) Employee 목록(필터/정렬/페이징은 기존 로직 재사용)
    var base = EMPLOYEE_list(payload);
    if (!base || !base.ok) return base || { ok:false, message:'EMPLOYEE_listTabs: EMPLOYEE_list 실패' };

    var employees = base.rows || [];

    // employee_id → employee 객체
    var emap = {};
    employees.forEach(function(e){
      var eid = String(e && e.employee_id || '').trim();
      if (eid) emap[eid] = e;
    });

    function truthy_(v){
      if (v === true) return true;
      var s = String(v || '').trim().toLowerCase();
      return (s === 'true' || s === 'y' || s === 'yes' || s === '1');
    }

    function readByEmployeeIds_(sheetName){
      var sh = DB_sheet_(sheetName);
      var header = DB_header_(sh);
      var map = DB_headerMap_(header);

      var lastRow = sh.getLastRow();
      if (lastRow < 2) return [];

      var eidIdx = map['employee_id'];
      if (eidIdx == null) return [];

      var values = sh.getRange(2, 1, lastRow - 1, header.length).getValues();
      var out = [];

      for (var r=0; r<values.length; r++){
        var row = values[r];
        var eid = String(row[eidIdx] || '').trim();
        if (!eid || !emap[eid]) continue;

        var obj = {};
        for (var c=0; c<header.length; c++){
          var k = String(header[c] || '').trim();
          if (!k) continue;
          obj[k] = row[c];
        }

        if (map['is_deleted'] != null && truthy_(obj.is_deleted)) continue;

        // join: employee_name(마스터)
        obj.employee_name = emap[eid].name;
        out.push(obj);
      }

      // 정렬: employee_id asc
      out.sort(function(a,b){
        var ae = String(a && a.employee_id || '');
        var be = String(b && b.employee_id || '');
        if (ae !== be) return (ae > be ? 1 : -1);
        return 0;
      });

      return out;
    }

    // 2) 하위 탭 데이터
    var positionRows      = readByEmployeeIds_('Employee_Position');
    var agreementRows     = readByEmployeeIds_('Employee_Agreement');
    var experienceRows    = readByEmployeeIds_('Employee_Experience');
    var educationRows     = readByEmployeeIds_('Employee_Education');
    var trainingRows      = readByEmployeeIds_('Employee_Training');
    var qualificationRows = readByEmployeeIds_('Employee_Qualification');

    var out = {
      ok: true,
      total: base.total,
      page: base.page,
      pageSize: base.pageSize,
      employeeRows: employees,
      positionRows: positionRows,
      agreementRows: agreementRows,
      experienceRows: experienceRows,
      educationRows: educationRows,
      trainingRows: trainingRows,
      qualificationRows: qualificationRows
    };

    // projectService.js의 KST JSON 변환 유틸이 있으면 활용
    if (typeof _jsonSafeKst_ === 'function') return _jsonSafeKst_(out);
    return JSON.parse(JSON.stringify(out));

  } catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  }
}
