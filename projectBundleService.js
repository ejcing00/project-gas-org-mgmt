/** projectBundleService.gs
 * - Project + 하위 6개 시트 한번에 저장(등록모드 기준)
 * - 방식: "자식 테이블은 프로젝트 기준으로 통째로 교체(Replace)"
 *   => 삭제/수정/추가를 프론트에서 따로 diff 계산 안 해도 됨
 *   => 대신 저장할 때마다 자식 row의 *_id는 새로 발급될 수 있음(초기엔 이게 가장 안정적)
 */

var PROJECT_BUNDLE = [
  { key:'Project_Finance',   sheet:'Project_Finance',   idField:'finance_id',   multi:true  },
  { key:'Project_Program',   sheet:'Project_Program',   idField:'program_id',   multi:true  },
  { key:'Project_Kpi',       sheet:'Project_Kpi',       idField:'kpi_id',       multi:true  },
  { key:'Project_Opi',       sheet:'Project_Opi',       idField:'opi_id',       multi:false }, // 보통 1행
  { key:'Project_Member_Ex', sheet:'Project_Member_Ex', idField:'member_ex_id', multi:true  },
  { key:'Project_Member_In', sheet:'Project_Member_In', idField:'member_in_id', multi:true  }
];

/**
 * 숫자 필드 정규화
 * - UI input-unit이 콤마/단위를 포함한 문자열을 보낼 수 있어 서버에서 숫자로 정리
 * - "문자열로 유지해야 하는" 필드는 넣지 말 것 (예: 계좌번호)
 */
var PROJECT_NUMERIC_FIELDS = {
  Project: [
    'budget_grant',
    'budget_match_cash',
    'budget_match_spot',
    'budget_total_grant_match',
    'budget_charge_cash',
    'budget_charge_spot',
    'budget_etc',
    'budget_total'
  ],
  Project_Finance: [
    'budget_amount'
  ],
  // OPI는 대부분 수치
  Project_Opi: [
    'support_prefounder','support_founder','support_total',
    'startup_new','startup_m&a',
    'revenue_domestic','revenue_overseas','revenue_total',
    'employment_exist','employment_new','employment_total',
    'investment_count','investment_amount',
    'ip_domestic_app_pantent','ip_domestic_app_utility','ip_domestic_app_trademark','ip_domestic_app_design',
    'ip_domestic_reg_pantent','ip_domestic_reg_utility','ip_domestic_reg_trademark','ip_domestic_reg_design','ip_domestic_reg_copyright',
    'ip_pct_pantent',
    'ip_overseas_app_pantent','ip_overseas_app_utility','ip_overseas_app_trademark','ip_overseas_app_design','ip_overseas_app_copyright',
    'ip_overseas_reg_pantent','ip_overseas_reg_utility','ip_overseas_reg_trademark','ip_overseas_reg_design','ip_overseas_reg_copyright'
  ]
};

function _pjtToNumberOrEmpty_(v){
  if (v === true) return 1;
  if (v === false) return 0;
  if (v == null) return '';
  var s = String(v).trim();
  if (!s) return '';
  var n = parseFloat(s.replace(/[^\d.-]/g,''));
  return isNaN(n) ? '' : n;
}

function _pjtNormalizeRowNumbers_(entityKey, obj){
  if (!obj || typeof obj !== 'object') return obj;
  var fields = PROJECT_NUMERIC_FIELDS[entityKey];
  if (!fields || !fields.length) return obj;
  fields.forEach(function(k){
    if (!obj.hasOwnProperty(k)) return;
    obj[k] = _pjtToNumberOrEmpty_(obj[k]);
  });
  return obj;
}

function PROJECT_saveBundle(payload){
  try{
    payload = payload || {};

    // ✅ 권한(등록모드)
    var me = DB_assertPerm_('btn:project:create'); // 개발 중이면 admin/superadmin 통과

    // ✅ project object 추출(여러 형태 허용)
    var project = _pjtPick_(payload, 'Project') || _pjtPick_(payload, 'project') || {};
    if (!project || typeof project !== 'object') project = {};

    // 필수값 체크
    var year = String(project.year || '').trim();
    var name = String(project.business_name || '').trim();
    if (!year) return { ok:false, message:'연도(year)는 필수입니다.' };
    if (!name) return { ok:false, message:'사업명(business_name)은 필수입니다.' };

    // ✅ update 모드 여부(값이 있으면 update + 자식테이블 replace)
    var incomingProjectId = String(project[PROJECT_ID_FIELD] || project.project_id || '').trim();
    var isUpdate = !!incomingProjectId;

    // ====== lock (Bundle 전체를 1번에 보호) ======
    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      // 1) finance rows(있으면) 정규화 + Project 예산 자동 계산(선택)
      var financeRows = _pjtPickRows_(payload, 'Project_Finance') || [];
      financeRows.forEach(function(r){ _pjtNormalizeRowNumbers_('Project_Finance', r); });
      // ✅ 실제 금액 입력이 있는 경우에만 예산 합계 적용 (빈행 1개로 0원 저장 방지)
      if (_pjtHasFinanceAmount_(financeRows)) {
        _pjtApplyBudgetFromFinance_(project, financeRows);
      }
      _pjtNormalizeRowNumbers_('Project', project);

      // 2) 중복 방지(연도+사업명)
      var dup = _PROJECT_findDuplicate_(year, name, incomingProjectId);
      if (dup && String(dup.project_id || '').trim() !== incomingProjectId) {
        return { ok:false, message:'이미 동일한 연도/사업명의 프로젝트가 존재합니다.', exists:true, project_id: dup.project_id, row: dup.rowIndex };
      }

      // 3) Project 저장(Create or Update)
      var projectId = incomingProjectId;

      if (isUpdate) {
        var updated = DB_updateByIdUnlocked_(PROJECT_SHEET_NAME, PROJECT_ID_FIELD, projectId, project, {
          actor: me,
          autoFields: true
        });
        if (!updated.ok) return updated;
      } else {

        // ✅ 신규등록 기본값 (soft delete + 표시)
        if (project.is_deleted == null || String(project.is_deleted).trim() === '') project.is_deleted = 0;
        if (project.is_visible == null || String(project.is_visible).trim() === '') project.is_visible = 0;

        var created = DB_insertUnlocked_(PROJECT_SHEET_NAME, project, {
          idField: PROJECT_ID_FIELD,
          actor: me,
          autoFields: true
        });
        if (!created.ok) return created;
        projectId = created.id;
      }

      // 2) 하위 6개 테이블 replace 저장
      var detail = {};
      PROJECT_BUNDLE.forEach(function(t){
        var rows = _pjtPickRows_(payload, t.key);
        // 숫자필드 정리
        rows.forEach(function(r){ _pjtNormalizeRowNumbers_(t.key, r); });

        // OPI는 보통 1행
        if (!t.multi){
          var one = (rows && rows.length) ? rows[0] : null;
          if (one) {
            var ignore = {};
            ignore[t.idField] = true;
            ignore['project_id'] = true;
            ignore['created_at'] = true; ignore['created_by'] = true;
            ignore['updated_at'] = true; ignore['updated_by'] = true;
            if (_pjtHasMeaningfulInput_(one, ignore)) {
              _pjtComputeOpiTotals_(one);
            }
            detail[t.key] = (isUpdate ? DB_syncByProjectIdUnlocked_(t.sheet, t.idField, projectId, [one], me)
                               : DB_replaceByProjectIdUnlocked_(t.sheet, t.idField, projectId, [one], me));
          } else {
            detail[t.key] = (isUpdate ? DB_syncByProjectIdUnlocked_(t.sheet, t.idField, projectId, [], me)
                               : DB_replaceByProjectIdUnlocked_(t.sheet, t.idField, projectId, [], me));
          }
          return;
        }
        detail[t.key] = (isUpdate ? DB_syncByProjectIdUnlocked_(t.sheet, t.idField, projectId, rows, me)
                               : DB_replaceByProjectIdUnlocked_(t.sheet, t.idField, projectId, rows, me));
      });

      return { ok:true, project_id: projectId, mode: (isUpdate ? 'update' : 'create'), detail: detail };

    } finally {
      lock.releaseLock();
    }

  } catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  }
}

/* -------------------------
 * Payload helper
 * ------------------------- */
function _pjtPick_(payload, key){
  if (!payload) return null;
  if (payload[key] != null) return payload[key];
  if (payload.tables && payload.tables[key] != null) return payload.tables[key];
  if (payload.children && payload.children[key] != null) return payload.children[key];
  return null;
}

function _pjtPickRows_(payload, key){
  var v = _pjtPick_(payload, key);
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return [v];
  return [];
}

/* -------------------------
 * DB helpers (Unlocked)
 * - Bundle에서 lock을 이미 잡았으므로 내부에서 lock을 다시 잡지 않음
 * ------------------------- */
function DB_insertUnlocked_(sheetName, obj, opts){
  opts = opts || {};
  var idField = opts.idField || 'id';
  var actor   = opts.actor || DB_getActor_();
  var autoFields = (opts.autoFields !== false);

  var sh = DB_sheet_(sheetName);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  if (!(idField in map)) throw new Error('ID 필드를 찾을 수 없습니다: ' + idField + ' in ' + sheetName);

  // nextId 생성
  var newId = DB_nextIntId_(sheetName, idField);
  obj[idField] = newId;

  if (autoFields) {
    var now = new Date();
    if (map['created_at'] != null && !obj.created_at) obj.created_at = now;
    if (map['updated_at'] != null) obj.updated_at = now;
    if (map['created_by'] != null) obj.created_by = DB_actorLabel_(actor);
    if (map['updated_by'] != null) obj.updated_by = DB_actorLabel_(actor);
  }

  // ✅ 소프트삭제 기본값: 신규 등록은 is_deleted=0
  // (해당 시트에 is_deleted 컬럼이 있을 때만 의미 있음)
  if (map['is_deleted'] != null && (obj.is_deleted == null || String(obj.is_deleted).trim() === '')) {
    obj.is_deleted = 0;
  }
  // 삭제 관련 필드가 payload에 섞여오면 신규 등록에서 제거(있어도 무해하지만 안전)
  if (map['deleted_at'] != null && obj.deleted_at != null) delete obj.deleted_at;
  if (map['deleted_by'] != null && obj.deleted_by != null) delete obj.deleted_by;

  // 중복 ID 최후 체크
  var idCol = map[idField] + 1;
  var vals = DB_readColumnValues_(sh, idCol);
  for (var i=0; i<vals.length; i++){
    if (String(vals[i]||'').trim() === String(newId)) {
      throw new Error('중복 ID 감지: ' + newId);
    }
  }

  var row = DB_objToRow_(header, obj);
  sh.appendRow(row);

  return { ok:true, id:newId };
}

function DB_replaceByProjectIdUnlocked_(sheetName, idField, projectId, rows, actor){
  // 1) project_id 컬럼 존재 확인
  var sh = DB_sheet_(sheetName);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  if (map['project_id'] == null){
    throw new Error(sheetName + ' 시트에 project_id 컬럼이 없습니다. (헤더 추가 필요)');
  }
  if (map[idField] == null){
    throw new Error(sheetName + ' 시트에 PK 컬럼이 없습니다: ' + idField);
  }

  // 2) 해당 project_id 기존행 삭제(내림차순)
  var deleted = DB_deleteWhereUnlocked_(sh, map['project_id']+1, projectId, actor);

  // 3) 새로 insert (빈 행 제외)
  var inserted = 0;
  rows = Array.isArray(rows) ? rows : [];

  rows.forEach(function(r){
    if (!r || typeof r !== 'object') return;

    // project_id 강제 주입
    r.project_id = projectId;

    // 빈 행이면 skip (PK/감사필드 제외하고 모두 공란)
    if (_pjtIsBlankRow_(r, idField)) return;

    DB_insertUnlocked_(sheetName, r, {
      idField: idField,
      actor: actor,
      autoFields: true
    });
    inserted++;
  });

  return { deleted: deleted, inserted: inserted };
}

/** -------------------------------------------------------
 * ✅ Diff 기반 동기화 저장 (Replace 방식 대체용)
 * - 기존 행을 모두 지우지 않고,
 *   1) 기존행과 비교해 변경된 것만 update
 *   2) 신규는 insert
 *   3) 빠진 기존행은 soft-delete
 * ------------------------------------------------------ */
function DB_syncByProjectIdUnlocked_(sheetName, idField, projectId, rows, actor){
  var sh = DB_sheet_(sheetName);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  if (map['project_id'] == null){
    throw new Error(sheetName + ' 시트에 project_id 컬럼이 없습니다. (헤더 추가 필요)');
  }
  if (map[idField] == null){
    throw new Error(sheetName + ' 시트에 PK 컬럼이 없습니다: ' + idField);
  }

  rows = Array.isArray(rows) ? rows : [];

  // ✅ 빈 행 제거 (id/감사/PK 제외 전부 공란이면 skip)
  var cleaned = [];
  rows.forEach(function(r){
    if (!r || typeof r !== 'object') return;
    r.project_id = projectId;
    if (_pjtIsBlankRow_(r, idField)) return;
    cleaned.push(r);
  });

  // 1) 기존 활성행 로드
  var existing = DB_listByProjectIdUnlocked_(sh, header, map, projectId);
  var exById = {};
  existing.forEach(function(it){
    var id = String(it.obj[idField] || '').trim();
    if (!id) return;
    exById[id] = it; // { rowNo, obj }
  });

  // 비교 시 무시할 필드
  var IGN = {};
  IGN[idField] = true;
  IGN['project_id'] = true;
  IGN['created_at'] = true; IGN['created_by'] = true;
  IGN['updated_at'] = true; IGN['updated_by'] = true;
  IGN['deleted_at'] = true; IGN['deleted_by'] = true;
  IGN['is_deleted'] = true;

  var seen = {};
  var inserted = 0, updated = 0, unchanged = 0;

  cleaned.forEach(function(r){
    var rid = String(r[idField] || '').trim();

    // 2) 기존행이 있으면 비교 후 update/skip
    if (rid && exById[rid]){
      var ex = exById[rid];
      seen[rid] = true;

      if (DB_rowsEqualForSync_(ex.obj, r, header, IGN)){
        unchanged++;
        return;
      }

      DB_updateRowByHeaderUnlocked_(sh, header, map, ex.rowNo, r, IGN, actor);
      updated++;
      return;
    }

    // 3) 신규 insert (PK 없거나 못 찾으면 신규)
    DB_insertUnlocked_(sheetName, r, {
      idField: idField,
      actor: actor,
      autoFields: true
    });
    inserted++;
  });

  // 4) payload에 없는 기존행은 soft-delete
  var toDelete = [];
  existing.forEach(function(it){
    var id = String(it.obj[idField] || '').trim();
    if (!id) return;
    if (seen[id]) return;
    toDelete.push(it.rowNo);
  });

  var deleted = 0;
  if (toDelete.length){
    deleted = DB_softDeleteRowsUnlocked_(sh, header, map, toDelete, actor);
  }

  return { deleted: deleted, inserted: inserted, updated: updated, unchanged: unchanged };
}

/** 기존 활성행 조회 (project_id 일치 + is_deleted != true) */
function DB_listByProjectIdUnlocked_(sh, header, map, projectId){
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  var values = sh.getRange(2, 1, lastRow-1, header.length).getValues();
  var out = [];
  var pid = String(projectId || '').trim();

  function truthy_(v){
    if (v === true) return true;
    var s = String(v || '').trim().toLowerCase();
    return (s === 'true' || s === 'y' || s === 'yes' || s === '1');
  }

  for (var i=0; i<values.length; i++){
    var row = values[i];
    var obj = {};
    for (var c=0; c<header.length; c++){
      var k = String(header[c] || '').trim();
      if (!k) continue;
      obj[k] = row[c];
    }

    if (String(obj.project_id || '').trim() !== pid) continue;
    if (map['is_deleted'] != null && truthy_(obj.is_deleted)) continue;

    out.push({ rowNo: i+2, obj: obj });
  }

  return out;
}

/** row 비교: header 기준으로 IGN 제외하고 값이 같으면 true */
function DB_rowsEqualForSync_(a, b, header, IGN){
  function norm_(v){
    if (v == null) return '';
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      // 보통 child는 날짜만 비교하면 충분(시간은 의미 없음)
      return Utilities.formatDate(v, APP_TZ, 'yyyy-MM-dd');
    }
    if (typeof v === 'number' && !isNaN(v)) return String(v);
    if (v === true) return 'true';
    if (v === false) return 'false';
    return String(v).trim();
  }

  for (var i=0; i<header.length; i++){
    var k = String(header[i] || '').trim();
    if (!k || (IGN && IGN[k])) continue;

    // payload에 없는 필드는 비교/수정 대상에서 제외(부분 payload 대응)
    if (b && !Object.prototype.hasOwnProperty.call(b, k)) continue;

    var av = norm_(a ? a[k] : '');
    var bv = norm_(b ? b[k] : '');

    if (av !== bv) return false;
  }
  return true;
}

/** 단일 row update (IGN 제외) + updated_at/by 갱신 */
function DB_updateRowByHeaderUnlocked_(sh, header, map, rowNo, obj, IGN, actor){
  var now = new Date();
  var who = actor ? DB_actorLabel_(actor) : '';

  for (var i=0; i<header.length; i++){
    var k = String(header[i] || '').trim();
    if (!k || (IGN && IGN[k])) continue;
    if (!obj.hasOwnProperty(k)) continue;

    sh.getRange(rowNo, i+1).setValue(obj[k]);
  }

  if (map['updated_at'] != null) sh.getRange(rowNo, map['updated_at']+1).setValue(now);
  if (map['updated_by'] != null) sh.getRange(rowNo, map['updated_by']+1).setValue(who);
}

/** 여러 row 소프트삭제 (rowNo 배열) */
function DB_softDeleteRowsUnlocked_(sh, header, map, rowNos, actor){
  rowNos = Array.isArray(rowNos) ? rowNos : [];
  if (!rowNos.length) return 0;

  function truthy_(v){
    if (v === true) return true;
    var s = String(v || '').trim().toLowerCase();
    return (s === 'true' || s === 'y' || s === 'yes' || s === '1');
  }

  // is_deleted가 없으면 하드삭제 fallback
  if (map['is_deleted'] == null){
    rowNos.sort(function(a,b){ return b-a; });
    rowNos.forEach(function(r){ sh.deleteRow(r); });
    return rowNos.length;
  }

  var now = new Date();
  var who = actor ? DB_actorLabel_(actor) : '';

  rowNos.forEach(function(rowNo){
    var cur = sh.getRange(rowNo, map['is_deleted']+1).getValue();
    if (truthy_(cur)) return;

    sh.getRange(rowNo, map['is_deleted']+1).setValue(1);
    if (map['deleted_at'] != null) sh.getRange(rowNo, map['deleted_at']+1).setValue(now);
    if (map['deleted_by'] != null) sh.getRange(rowNo, map['deleted_by']+1).setValue(who);
    if (map['updated_at'] != null) sh.getRange(rowNo, map['updated_at']+1).setValue(now);
    if (map['updated_by'] != null) sh.getRange(rowNo, map['updated_by']+1).setValue(who);
  });

  return rowNos.length;
}


function DB_deleteWhereUnlocked_(sh, colIndex1Based, matchValue, actor){
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  var values = sh.getRange(2, colIndex1Based, lastRow-1, 1).getValues();
  var del = [];
  var mv = String(matchValue || '').trim();

  for (var i=0; i<values.length; i++){
    if (String(values[i][0] || '').trim() === mv) del.push(i+2);
  }

  if (!del.length) return 0;

  // ✅ 소프트삭제: is_deleted 컬럼이 있으면 마킹, 없으면 기존 하드삭제
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  function truthy_(v){
    if (v === true) return true;
    var s = String(v || '').trim().toLowerCase();
    return (s === 'true' || s === 'y' || s === 'yes' || s === '1');
  }

  if (map['is_deleted'] != null){
    var now = new Date();
    var who = actor ? DB_actorLabel_(actor) : '';
    del.forEach(function(rowNo){
      // 이미 소프트삭제된 행이면 스킵(중복 마킹 방지)
      var cur = sh.getRange(rowNo, map['is_deleted'] + 1).getValue();
      if (truthy_(cur)) return;

      sh.getRange(rowNo, map['is_deleted'] + 1).setValue(1);
      if (map['deleted_at'] != null) sh.getRange(rowNo, map['deleted_at'] + 1).setValue(now);
      if (map['deleted_by'] != null) sh.getRange(rowNo, map['deleted_by'] + 1).setValue(who);
      if (map['updated_at'] != null) sh.getRange(rowNo, map['updated_at'] + 1).setValue(now);
      if (map['updated_by'] != null) sh.getRange(rowNo, map['updated_by'] + 1).setValue(who);
    });
    return del.length;
  }

  // 하드삭제(기존 동작 유지)
  del.sort(function(a,b){ return b-a; });
  del.forEach(function(r){ sh.deleteRow(r); });
  return del.length;
}

function _pjtIsBlankRow_(obj, idField){
  var IGNORE = {
    'project_id':true,
    'created_at':true,'created_by':true,'updated_at':true,'updated_by':true
  };
  IGNORE[idField] = true;

  var keys = Object.keys(obj);
  for (var i=0;i<keys.length;i++){
    var k = keys[i];
    if (IGNORE[k]) continue;
    var v = obj[k];

    // checkbox true 같은 값도 "값 있음"으로 처리
    if (v === true) return false;

    if (v == null) continue;
    if (typeof v === 'number' && !isNaN(v)) return false;

    var s = String(v).trim();
    if (s !== '') return false;
  }
  return true;
}

/* -------------------------
 * 선택: Finance 입력으로 Project 예산 자동 계산
 * ------------------------- */
function _pjtApplyBudgetFromFinance_(project, financeRows){
  financeRows = Array.isArray(financeRows) ? financeRows : [];
  if (!financeRows.length) return;

  function num_(v){
    var n = parseFloat(String(v||'').replace(/[^\d.-]/g,''));
    return isNaN(n) ? 0 : n;
  }

  var sum = { grant:0, cash:0, spot:0, charge_cash:0, charge_spot:0, etc:0, total:0 };

  financeRows.forEach(function(r){
    if (!r) return;
    var cat = String(r.budget_category || '').trim();
    var amt = num_(r.budget_amount);

    sum.total += amt;
    if (cat === '보조금') sum.grant += amt;
    else if (cat === '대응자금(현금)') sum.cash += amt;
    else if (cat === '대응자금(현물)') sum.spot += amt;
    else if (cat === '기업부담금(현금)') sum.charge_cash += amt;
    else if (cat === '기업부담금(현물)') sum.charge_spot += amt;
    else if (cat === '기타자금') sum.etc += amt;
    else sum.etc += amt; // 혹시 모를 예외 카테고리는 기타로 처리
  });

  project.budget_grant = sum.grant;
  project.budget_match_cash = sum.cash;
  project.budget_match_spot = sum.spot;
  project.budget_total_grant_match = (sum.grant + sum.cash + sum.spot);
  project.budget_charge_cash = sum.charge_cash;
  project.budget_charge_spot = sum.charge_spot;
  project.budget_etc = sum.etc;
  project.budget_total = sum.total;
}

/* -------------------------
 * 선택: OPI 자동 합계
 * - UI에서 div로 보여주는 합계필드는 서버에서도 맞춰줌
 * ------------------------- */
function _pjtComputeOpiTotals_(opi){
  function hasDigit_(v){ return /\d/.test(String(v || '')); }
  function num_(v){
    var n = parseFloat(String(v||'').replace(/[^\d.-]/g,''));
    return isNaN(n) ? 0 : n;
  }

  // ✅ 지원 합계: 입력이 있을 때만 계산, 없으면 '' 유지
  var hasSupport = hasDigit_(opi.support_prefounder) || hasDigit_(opi.support_founder);
  if (hasSupport) opi.support_total = num_(opi.support_prefounder) + num_(opi.support_founder);
  else opi.support_total = '';

  // ✅ 매출 합계
  var hasRevenue = hasDigit_(opi.revenue_domestic) || hasDigit_(opi.revenue_overseas);
  if (hasRevenue) opi.revenue_total = num_(opi.revenue_domestic) + num_(opi.revenue_overseas);
  else opi.revenue_total = '';

  // ✅ 고용 합계
  var hasEmp = hasDigit_(opi.employment_exist) || hasDigit_(opi.employment_new);
  if (hasEmp) opi.employment_total = num_(opi.employment_exist) + num_(opi.employment_new);
  else opi.employment_total = '';
}

function PROJECT_checkDuplicate(year, businessName, excludeProjectId){
  try{
    year = String(year || '').trim();
    businessName = String(businessName || '').trim();
    excludeProjectId = String(excludeProjectId || '').trim();

    if (!year || !businessName) return { ok:true, exists:false };

    var hit = _PROJECT_findDuplicate_(year, businessName, excludeProjectId);
    if (!hit) return { ok:true, exists:false };

    return { ok:true, exists:true, project_id: hit.project_id, row: hit.rowIndex };

  } catch(err){
    return { ok:false, message: err && err.message ? err.message : String(err) };
  }
}

function _PROJECT_findDuplicate_(year, businessName, excludeProjectId){
  var sh = DB_sheet_(PROJECT_SHEET_NAME);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  if (map['year'] == null || map['business_name'] == null || map[PROJECT_ID_FIELD] == null){
    throw new Error('Project 시트에 year/business_name/project_id 헤더가 필요합니다.');
  }

  var last = sh.getLastRow();
  if (last < 2) return null;

  var values = sh.getRange(2, 1, last - 1, header.length).getValues();
  var yIdx = map['year'];
  var nIdx = map['business_name'];
  var idIdx = map[PROJECT_ID_FIELD];

  excludeProjectId = String(excludeProjectId || '').trim();

  for (var i=0; i<values.length; i++){
    var r = values[i];
    var y = String(r[yIdx] || '').trim();
    var n = String(r[nIdx] || '').trim();
    var pid = String(r[idIdx] || '').trim();

    if (excludeProjectId && pid === excludeProjectId) continue;
    if (y === year && n === businessName){
      return { project_id: pid, rowIndex: i + 2 };
    }
  }
  return null;
}

function _PROJECT_ymdInt_(v){
  var m = String(v||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  return Number(m[1])*10000 + Number(m[2])*100 + Number(m[3]);
}

// Finance: 실제 금액 입력이 있는 행이 1개라도 있는지
function _pjtHasFinanceAmount_(financeRows){
  financeRows = Array.isArray(financeRows) ? financeRows : [];
  return financeRows.some(function(r){
    var digits = String((r && r.budget_amount) || '').replace(/[^\d]/g,'').trim();
    return !!digits;
  });
}

// OPI: 의미있는 입력(숫자/텍스트/체크 true)이 하나라도 있는지
function _pjtHasMeaningfulInput_(obj, ignoreKeys){
  obj = obj || {};
  ignoreKeys = ignoreKeys || {};
  return Object.keys(obj).some(function(k){
    if (ignoreKeys[k]) return false;
    var v = obj[k];
    if (v === true) return true;
    if (v == null) return false;
    var s = String(v).trim();
    return s !== '';
  });
}

/**
 * Employee 번들 삭제
 * - Employee(마스터) + 하위 6개 시트 employee_id 기준 삭제
 * - Employee 시트에 is_deleted 컬럼이 있으면 "소프트삭제", 없으면 "하드삭제"
 */
function EMPLOYEE_deleteBundle(employeeId){
  try{
    var id = String(employeeId || '').trim();
    if (!id) return { ok:false, message:'employee_id가 필요합니다.' };

    // 권한(없으면 admin만 통과하는 구조일 가능성 큼)
    var me = DB_assertPerm_('btn:employee:delete');

    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      // ===== 1) 마스터 Employee 삭제 =====
      var sh = DB_sheet_(EMPLOYEE_SHEET_NAME);
      var header = DB_header_(sh);
      var map = DB_headerMap_(header);

      var rowIndex = DB_findRowIndexByIdUnlocked_(sh, EMPLOYEE_ID_FIELD, id);
      if (!rowIndex) return { ok:false, message:'삭제 대상(Employee)을 찾을 수 없습니다: ' + id };

      // (A) 소프트 삭제: is_deleted 컬럼이 있으면 true로 마킹
      if (map['is_deleted'] != null){
        var now = new Date();

        // 한 줄 읽고/수정 후 다시 씀(간단/안전)
        var rowVals = sh.getRange(rowIndex, 1, 1, header.length).getValues()[0];
        var obj = {};
        header.forEach(function(k, i){
          k = String(k || '').trim();
          if (k) obj[k] = rowVals[i];
        });

        obj.is_deleted = true;

        if (map['deleted_at'] != null) obj.deleted_at = now;
        if (map['deleted_by'] != null) obj.deleted_by = DB_actorLabel_(me);

        if (map['updated_at'] != null) obj.updated_at = now;
        if (map['updated_by'] != null) obj.updated_by = DB_actorLabel_(me);

        sh.getRange(rowIndex, 1, 1, header.length).setValues([DB_objToRow_(header, obj)]);
      } else {
        // (B) 하드 삭제: 행 자체 삭제
        sh.deleteRow(rowIndex);
      }

      // ===== 2) 하위 테이블 employee_id 기준 삭제 =====
      var deletedDetail = {};
      EMPLOYEE_BUNDLE.forEach(function(t){
        var childSh = DB_sheet_(t.sheet);
        var childHeader = DB_header_(childSh);
        var childMap = DB_headerMap_(childHeader);

        if (childMap['employee_id'] == null) {
          deletedDetail[t.key] = { deleted:0, note:'employee_id 컬럼 없음' };
          return;
        }

        var cnt = _empDeleteWhereUnlocked_(childSh, childMap['employee_id'] + 1, id);
        deletedDetail[t.key] = { deleted: cnt };
      });

      return { ok:true, employee_id:id, detail: deletedDetail };

    } finally {
      lock.releaseLock();
    }

  } catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  }
}

