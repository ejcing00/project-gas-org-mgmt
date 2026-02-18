/** projectService.gs
 * Project 등록(Create) 1차: Project 본체만 저장
 */

var PROJECT_SHEET_NAME = 'Project';
var PROJECT_ID_FIELD   = 'project_id';

/** =========================
 * 정렬 유틸 (Project 메인 6탭 공통)
 * - 1순위 year 오름차순
 * - 2순위 start_date 오름차순
 * - 3순위 business_name 오름차순
 * ========================= */
function PROJECT__num_(v, fallback){
  var n = parseInt(String(v||'').trim(), 10);
  return isNaN(n) ? (fallback == null ? 0 : fallback) : n;
}
function PROJECT__dateKey_(v){
  if (v == null || v === '') return 99999999;
  // Date
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())){
    var d = v;
    return (d.getFullYear()*10000) + ((d.getMonth()+1)*100) + d.getDate();
  }
  var s = String(v||'').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return (parseInt(m[1],10)*10000) + (parseInt(m[2],10)*100) + parseInt(m[3],10);
  // fallback: 문자열 비교를 숫자키로 대체 불가하면 큰값으로(뒤로)
  return 99999998;
}
function PROJECT__cmpText_(a,b){
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  if (a === b) return 0;
  try{
    return a.localeCompare(b, 'ko', { numeric:true, sensitivity:'base' });
  }catch(e){
    return (a > b ? 1 : -1);
  }
}
function PROJECT_cmpCommon_(a,b){
  var ay = PROJECT__num_(a && a.year, 999999);
  var by = PROJECT__num_(b && b.year, 999999);
  if (ay !== by) return ay - by;

  var ad = PROJECT__dateKey_(a && a.start_date);
  var bd = PROJECT__dateKey_(b && b.start_date);
  if (ad !== bd) return ad - bd;

  var an = (a && a.business_name) || '';
  var bn = (b && b.business_name) || '';
  return PROJECT__cmpText_(an, bn);
}
function PROJECT__orderIdx_(orderMap, v){
  var key = String(v == null ? '' : v).trim();
  if (!key) return 999999; // 공백은 항상 마지막
  return (orderMap && orderMap.hasOwnProperty(key)) ? orderMap[key] : 999998; // 미지정은 공백 직전
}
function PROJECT_cmpOrder_(aVal, bVal, orderMap){
  var ai = PROJECT__orderIdx_(orderMap, aVal);
  var bi = PROJECT__orderIdx_(orderMap, bVal);
  if (ai !== bi) return ai - bi;
  return 0;
}
function PROJECT_cmpNumStr_(aVal, bVal){
  var a = String(aVal == null ? '' : aVal).trim();
  var b = String(bVal == null ? '' : bVal).trim();
  var na = parseInt(a, 10);
  var nb = parseInt(b, 10);
  var aNum = (!isNaN(na) && String(na) === a);
  var bNum = (!isNaN(nb) && String(nb) === b);
  if (aNum && bNum && na !== nb) return na - nb;
  return PROJECT__cmpText_(a, b);
}

function PROJECT_create(payload){
  try{
    // 권한 체크(개발 중이면 admin/superadmin은 자동통과)
    var me = DB_assertPerm_('btn:project:create');

    payload = payload || {};

    // ✅ 최소 필수값 검증(원하면 항목 추가 가능)
    var year = String(payload.year || '').trim();
    var name = String(payload.business_name || '').trim();

    if (!year) return { ok:false, message:'연도(year)는 필수입니다.' };
    if (!name) return { ok:false, message:'사업명(business_name)은 필수입니다.' };

    // ✅ Project 시트 헤더 기준으로 저장할 객체 구성
    // - 필요하면 여기서 "허용 필드만" whitelist로 걸 수 있음
    var obj = {};
    Object.keys(payload).forEach(function(k){
      obj[k] = payload[k];
    });

    // ✅ 소프트삭제 기본값: 신규등록은 is_deleted=0
    // (시트에 is_deleted 컬럼이 없으면 DB_insert_가 무시하므로 안전)
    if (obj.is_deleted == null || String(obj.is_deleted).trim() === '') obj.is_deleted = 0;

    // ✅ 표시 기본값: 신규등록은 is_visible=0(활성)
    if (obj.is_visible == null || String(obj.is_visible).trim() === '') obj.is_visible = 0;

    // insert (project_id 자동 생성)
    var res = DB_insert_(PROJECT_SHEET_NAME, obj, {
      idField: PROJECT_ID_FIELD,
      actor: me,
      autoFields: true
    });

    if (!res.ok) return res;

    return { ok:true, project_id: res.id };

  } catch(err){
    return { ok:false, message: err && err.message ? err.message : String(err) };
  }
}

/** 프론트에서 이름을 PROJECT_saveProject로 호출하고 싶으면 호환용으로 */
function PROJECT_saveProject(payload){
  // 지금은 등록만
  return PROJECT_create(payload);
}

function PROJECT_saveTables(payload){
  // 프론트가 보내는 payload 구조가 { project, tables }면 그대로 통과
  // (네 collectPayload_가 이 구조임)
  return PROJECT_saveBundle(payload);
}

/** 프로젝트 목록 조회 (Project 시트)
 * payload:
 *  - year: "2026" 같은 문자열(옵션)
 *  - q: 검색어(옵션) - business_name/purpose/executing_agency 기준 단순 검색
 *  - page: 1부터
 *  - pageSize: 기본 50, 최대 200
 */
function PROJECT_list(payload){
  var __perf = (typeof DB_perfStart_ === 'function')
    ? DB_perfStart_('PROJECT_list')
    : null;
  var __perfMeta = { ok:false, total:0, rows:0 };
  try{
    // ✅ 페이지 조회 권한 (Permission 시트에 page:project:view가 있어야 함)
    var me = DB_assertPerm_('page:project:view');

    payload = payload || {};
    var year = String(payload.year || '').trim();
    var q = String(payload.q || '').trim().toLowerCase();

    var page = parseInt(payload.page || 1, 10);
    var pageSize = parseInt(payload.pageSize || 50, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1) pageSize = 50;
    if (pageSize > 200) pageSize = 200;

    var t = DB_readRows_(PROJECT_SHEET_NAME);
    var header = t.header || [];
    var rowsSrc = t.rows || [];
    var map = DB_headerMap_(header);

    if (!header.length || !rowsSrc.length) {
      __perfMeta.ok = true;
      return { ok:true, total:0, page:page, pageSize:pageSize, rows:[] };
    }

    function truthy_(v){
      if (v === true) return true;
      var s = String(v || '').trim().toLowerCase();
      return (s === 'true' || s === 'y' || s === 'yes' || s === '1');
    }

    function fmtDate_(v){
      if (!v) return '';
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, APP_TZ, 'yyyy-MM-dd');
      }
      return String(v);
    }

    function fmtDateTime_(v){
      if (!v) return '';
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, APP_TZ, 'yyyy-MM-dd HH:mm:ss');
      }
      return String(v);
    }

    var out = [];
    for (var r=0; r<rowsSrc.length; r++){
      var src = rowsSrc[r] || {};
      var obj = {};
      Object.keys(src).forEach(function(k){
        var v = src[k];
        // 날짜 필드 안전 변환(시트에 Date로 들어가도 프론트에서 다루기 쉽게)
        if (k === 'start_date' || k === 'end_date') v = fmtDate_(v);
        if (k === 'created_at' || k === 'updated_at') v = fmtDateTime_(v);
        obj[k] = v;
      });

      // soft delete 컬럼이 있으면 제외
      if (map['is_deleted'] != null && truthy_(obj.is_deleted)) continue;

      // ✅ 비활성(is_visible=1)이면 제외 (컬럼이 있을 때만)
      if (map['is_visible'] != null && truthy_(obj.is_visible)) continue;

      if (year && String(obj.year || '').trim() !== year) continue;

      if (q){
        var hay = (
          String(obj.business_name || '') + ' ' +
          String(obj.purpose || '') + ' ' +
          String(obj.executing_agency || '')
        ).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }

      out.push(obj);
    }

    // 정렬: ✅ 공통정렬 (year asc → start_date asc → business_name asc)
    out.sort(function(a,b){
      return PROJECT_cmpCommon_(a,b);
    });

    var total = out.length;
    var start = (page - 1) * pageSize;
    var rows = out.slice(start, start + pageSize);
    __perfMeta.ok = true;
    __perfMeta.total = total;
    __perfMeta.rows = rows.length;

    return { ok:true, total:total, page:page, pageSize:pageSize, rows:rows };

  } catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  } finally{
    if (__perf && typeof DB_perfEnd_ === 'function') DB_perfEnd_(__perf, __perfMeta);
  }
}

/**
 * ✅ 엑셀 다운로드용 목록 조회 (필터 상태 기반)
 * - filters: FilterWrap.getState(wrap) 결과 또는 { selectedByPanel: ... } 형태
 * - 페이징 없음(다운로드는 전체를 뽑는게 일반적)
 * - 반환은 { ok:true, items:[{project_id,...}] } 형태(엑셀 서비스가 쓰기 편하게)
 */
function PROJECT_listForExport_(filters){
  DB_assertPerm_('page:project:view');

  var res = PROJECT_listByPanelFilters_(filters); // 아래 함수(고급필터)
  if (!res || !res.ok) return res || { ok:false, message:'PROJECT_listForExport_: 실패' };

  return {
    ok: true,
    items: res.items || []
  };
}

/**
 * ✅ FilterWrap.getState 기반(패널별) 고급 필터 적용
 * - 반환: { ok:true, items:[...] }
 */
function PROJECT_listByPanelFilters_(params) {
  params = params || {};

  // filters가 {selectedByPanel:...} 형태로 들어오거나,
  // FilterWrap.getState(wrap) 전체가 들어올 수도 있어서 흡수
  var fs = (params && params.selectedByPanel) ? params
         : (params && params.filters && params.filters.selectedByPanel) ? params.filters
         : (params && params.filters) ? params.filters
         : params;

  var byPanel = fs.selectedByPanel || {};

  function panel(major, sub){
    return byPanel[(major + '|' + sub)] || { selected:{}, inputs:{} };
  }
  function pickList(obj, key){
    var arr = (obj && obj.selected && obj.selected[key]) ? obj.selected[key] : [];
    return Array.isArray(arr) ? arr : [];
  }
  function pickInputs(obj){
    return (obj && obj.inputs) ? obj.inputs : {};
  }
  function normText(v){ return String(v == null ? '' : v).trim(); }
  function normYear(v){
    var s = normText(v);
    var m = s.match(/(\d{4})/);
    return m ? m[1] : s;
  }
  function parseDate(v){
    if (v instanceof Date) return v;
    var s = normText(v);
    if (!s) return null;

    var m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function overlap(pStart, pEnd, fStart, fEnd){
    var ps = pStart ? pStart.getTime() : -Infinity;
    var pe = pEnd ? pEnd.getTime() : Infinity;
    var fs = fStart ? fStart.getTime() : -Infinity;
    var fe = fEnd ? fEnd.getTime() : Infinity;
    return (pe >= fs) && (ps <= fe);
  }
  function anyMatch(val, list){
    if (!list || !list.length) return true;
    val = normText(val);
    for (var i=0;i<list.length;i++){
      if (val === normText(list[i])) return true;
    }
    return false;
  }
  function anyContains(val, list){
    if (!list || !list.length) return true;
    val = normText(val);
    for (var i=0;i<list.length;i++){
      var q = normText(list[i]);
      if (q && val.indexOf(q) >= 0) return true;
    }
    return false;
  }

  // ---------- 1) Project 로드 ----------
  var t = DB_readRows_('Project');
  var rows = t.rows || [];

  // ✅ 소프트삭제 제외(서비스단 필터에서도 1차로 제거)
  function truthy_(v){
    if (v === true) return true;
    var s = String(v || '').trim().toLowerCase();
    return (s === 'true' || s === 'y' || s === 'yes' || s === '1');
  }
  rows = rows.filter(function(r){
    // is_deleted 컬럼이 없으면 r.is_deleted가 undefined → truthy_ false → 통과
    if (truthy_(r && r.is_deleted)) return false;
    // is_visible=1(비활성)이면 제외 (컬럼 없으면 undefined → 통과)
    if (truthy_(r && r.is_visible)) return false;
    return true;
  });

  // ---------- 2) INFO 필터 ----------
  var pInfoYear   = panel('info','year');
  var pInfoName   = panel('info','name');
  var pInfoPeriod = panel('info','period');
  var pInfoNature = panel('info','nature');
  var pInfoType   = panel('info','type');
  var pInfoProc   = panel('info','process');

  var years   = pickList(pInfoYear, 'year').map(normYear).filter(Boolean);
  var names   = pickList(pInfoName, 'name').filter(Boolean);

  // nature 패널이 data-key="category"로 되어있어서 여기서 흡수
  var natures = (pickList(pInfoNature, 'nature').length ? pickList(pInfoNature, 'nature')
                : pickList(pInfoNature, 'category')).filter(Boolean);

  var types   = pickList(pInfoType, 'type').filter(Boolean);
  var procs   = pickList(pInfoProc, 'process').filter(Boolean);

  var periodInp = pickInputs(pInfoPeriod);
  var fStart = parseDate(periodInp.start_date);
  var fEnd   = parseDate(periodInp.end_date);

  var filtered = rows.filter(function(r){
    if (years.length && years.indexOf(normYear(r.year)) < 0) return false;
    if (names.length && !anyContains(r.business_name, names)) return false;
    if (natures.length && !anyMatch(r.nature, natures)) return false;
    if (types.length && !anyMatch(r.type, types)) return false;
    if (procs.length && !anyMatch(r.process, procs)) return false;

    if (fStart || fEnd){
      var ps = parseDate(r.start_date);
      var pe = parseDate(r.end_date);
      if (!overlap(ps, pe, fStart, fEnd)) return false;
    }
    return true;
  });

  // ---------- 3) 하위테이블 기반 필터(있으면) ----------
  function hasAnyCriteria(p){
    var sel = (p && p.selected) ? p.selected : {};
    var inp = (p && p.inputs) ? p.inputs : {};
    var k;
    for (k in sel) if (sel.hasOwnProperty(k) && (sel[k]||[]).length) return true;
    for (k in inp) if (inp.hasOwnProperty(k) && String(inp[k]||'').trim() !== '') return true;
    return false;
  }

  // Finance
  var pFinCategory = panel('finance','category');
  var pFinSource   = panel('finance','source');
  var pFinSystem   = panel('finance','system');
  var pFinAccCat   = panel('finance','accounting_category');
  var pFinAccName  = panel('finance','accounting_name');
  var pFinAccount  = panel('finance','account');
  var pFinStatus   = panel('finance','account_status');

  var finActive = [pFinCategory,pFinSource,pFinSystem,pFinAccCat,pFinAccName,pFinAccount,pFinStatus].some(hasAnyCriteria);

  if (finActive){
    var tf = DB_readRows_('Project_Finance');
    var frows = tf.rows || [];

    // ✅ 소프트삭제된 하위행 제외
    frows = frows.filter(function(r){ return !truthy_(r && r.is_deleted); });

    var finCrit = {
      category: pickList(pFinCategory,'category'),
      source: pickList(pFinSource,'source'),
      system: pickList(pFinSystem,'system'),
      accounting_category: pickList(pFinAccCat,'accounting_category'),
      accounting_name: pickList(pFinAccName,'accounting_name'),
      account: pickList(pFinAccount,'account'),
      account_status: pickList(pFinStatus,'account_status')
    };

    var okPid = {};
    frows.forEach(function(fr){
      var pid = normText(fr.project_id);
      if (!pid) return;

      function passField(field){
        var list = finCrit[field] || [];
        if (!list.length) return true;
        return anyMatch(fr[field], list);
      }

      if (passField('category')
        && passField('source')
        && passField('system')
        && passField('accounting_category')
        && passField('accounting_name')
        && passField('account')
        && passField('account_status')
      ){
        okPid[pid] = true;
      }
    });

    filtered = filtered.filter(function(r){ return !!okPid[normText(r.project_id)]; });
  }

  // Program
  var pPrgCat = panel('program','category');
  var pPrgNat = panel('program','nature');
  var prgActive = [pPrgCat,pPrgNat].some(hasAnyCriteria);

  if (prgActive){
    var tp = DB_readRows_('Project_Program');
    var prows = tp.rows || [];

    // ✅ 소프트삭제된 하위행 제외
    prows = prows.filter(function(r){ return !truthy_(r && r.is_deleted); });

    var prgCrit = {
      category: pickList(pPrgCat,'category'),
      nature: pickList(pPrgNat,'nature')
    };

    var okPid2 = {};
    prows.forEach(function(pr){
      var pid = normText(pr.project_id);
      if (!pid) return;

      function passField(field){
        var list = prgCrit[field] || [];
        if (!list.length) return true;
        return anyMatch(pr[field], list);
      }

      if (passField('category') && passField('nature')) okPid2[pid] = true;
    });

    filtered = filtered.filter(function(r){ return !!okPid2[normText(r.project_id)]; });
  }

  // KPI
  var pKpiCat = panel('kpi','category');
  var kpiActive = hasAnyCriteria(pKpiCat);

  if (kpiActive){
    var tk = DB_readRows_('Project_Kpi');
    var krows = tk.rows || [];
    // ✅ 소프트삭제된 하위행 제외
    krows = krows.filter(function(r){ return !truthy_(r && r.is_deleted); });

    var sel = (pKpiCat.selected || {});
    var kpiVals = [];
    Object.keys(sel).forEach(function(k){
      (sel[k] || []).forEach(function(v){
        v = normText(v);
        if (v && kpiVals.indexOf(v) < 0) kpiVals.push(v);
      });
    });

    var okPid3 = {};
    krows.forEach(function(kr){
      var pid = normText(kr.project_id);
      if (!pid) return;
      if (!kpiVals.length || anyMatch(kr.category, kpiVals)) okPid3[pid] = true;
    });

    filtered = filtered.filter(function(r){ return !!okPid3[normText(r.project_id)]; });
  }

  // ---------- 4) items로 변환 + 정렬 ----------
  var items = filtered.map(function (r) {
    return {
      project_id: r.project_id,
      year: r.year,
      business_name: r.business_name,
      nature: r.nature,
      type: r.type,
      process: r.process,
      selection_info: r.selection_info,
      start_date: r.start_date,
      end_date: r.end_date
    };
  });

  items.sort(function (a, b) {
    var ya = Number(normYear(a.year)) || 0, yb = Number(normYear(b.year)) || 0;
    if (ya !== yb) return yb - ya;
    return Number(b.project_id || 0) - Number(a.project_id || 0);
  });

  return { ok: true, items: items };
}

function PROJECT_getBundle(projectId){
  var __perf = (typeof DB_perfStart_ === 'function')
    ? DB_perfStart_('PROJECT_getBundle')
    : null;
  var __perfMeta = { ok:false, tableRows:0 };
  try{
    DB_assertPerm_('page:project:view');

    projectId = String(projectId || '').trim();
    if (!projectId) return { ok:false, message:'project_id가 필요합니다.' };

    // ✅ dbCore.DB_getById_는 "객체 or null"을 반환하는 형태이므로 그에 맞춰 처리
    var project = DB_getById_(PROJECT_SHEET_NAME, PROJECT_ID_FIELD, projectId);
    if (!project) {
      return { ok:false, message:'프로젝트를 찾을 수 없습니다. project_id=' + projectId };
    }

    // ✅ 소프트삭제된 프로젝트는 조회 불가 처리
    function truthy_(v){
      if (v === true) return true;
      var s = String(v || '').trim().toLowerCase();
      return (s === 'true' || s === 'y' || s === 'yes' || s === '1');
    }
    if (truthy_(project.is_deleted)) {
      return { ok:false, message:'프로젝트를 찾을 수 없습니다. project_id=' + projectId };
    }

    // Date → 문자열 직렬화(프로젝트 서비스에 이미 _pjt_serializeDates_가 있으면 그대로 사용)
    if (typeof _pjt_serializeDates_ === 'function') project = _pjt_serializeDates_(project);

    // 자식 테이블들
    var tables = {};
    function readProjectRows_(sheetName){
      var t = DB_readRows_(sheetName);
      var header = t.header || [];
      var rows = t.rows || [];
      if (!header.length || !rows.length) return [];
      if (header.indexOf('project_id') < 0) return [];

      var out = [];
      for (var i=0; i<rows.length; i++){
        var r = rows[i] || {};
        if (String(r.project_id || '').trim() !== projectId) continue;
        if (truthy_(r.is_deleted)) continue;

        // cache 오염 방지용 shallow copy
        var o = {};
        Object.keys(r).forEach(function(k){ o[k] = r[k]; });
        out.push(o);
      }
      return out;
    }

    (PROJECT_BUNDLE || []).forEach(function(cfg){
      var rows = readProjectRows_(cfg.sheet);

      if (typeof _pjt_serializeDates_ === 'function') {
        rows = rows.map(function(r){ return _pjt_serializeDates_(r); });
      }
      // multi=false(예: OPI)는 최대 1행만
      if (cfg.multi === false && rows.length > 1) rows = rows.slice(0, 1);
      tables[cfg.key] = rows;
    });

    var out = {
      ok: true,
      project_id: projectId,
      project: project,
      tables: tables
    };
    __perfMeta.ok = true;
    __perfMeta.tableRows = Object.keys(tables || {}).reduce(function(acc, k){
      var arr = tables[k];
      return acc + (Array.isArray(arr) ? arr.length : 0);
    }, 0);

    // ✅ 응답 직렬화 강제(안전장치)
    // - Date, undefined, 특수객체 등이 섞여있을 때 클라로 깨지는 걸 방지
    return _jsonSafeKst_(out);
  
  } catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  } finally{
    if (__perf && typeof DB_perfEnd_ === 'function') DB_perfEnd_(__perf, __perfMeta);
  }
}

/**
 * ✅ 프로젝트 목록(탭용) 한번에 반환
 * - Project 목록 + 하위(예산/회계, 프로그램, KPI, OPI, 참여인력) 시트 데이터를
 *   "현재 페이지에 포함된 프로젝트" 기준으로 묶어서 내려줌
 * - 프론트: 페이지 진입 시 1회 호출 → 탭 전환 시 추가 로드 없이 즉시 표시
 *
 * payload:
 *  - year, q, page, pageSize : PROJECT_list와 동일
 */
function PROJECT_listTabs(payload){
  try{
    DB_assertPerm_('page:project:view');

    payload = payload || {};

    // 1) Project 목록(필터/정렬/페이징은 기존 로직 재사용)
    var base = PROJECT_list(payload);
    if (!base || !base.ok) return base || { ok:false, message:'PROJECT_listTabs: PROJECT_list 실패' };

    var projects = base.rows || [];

    // 프로젝트 id → 프로젝트 객체
    var pmap = {};
    projects.forEach(function(p){
      var pid = String(p && p.project_id || '').trim();
      if (pid) pmap[pid] = p;
    });

    function truthy_(v){
      if (v === true) return true;
      var s = String(v || '').trim().toLowerCase();
      return (s === 'true' || s === 'y' || s === 'yes' || s === '1');
    }

    function readByProjectIds_(sheetName){
      var t = DB_readRows_(sheetName);
      var header = t.header || [];
      var values = t.rows || [];
      var map = DB_headerMap_(header);
      if (!header.length || !values.length) return [];

      var out = [];
      if (map['project_id'] == null) return [];

      for (var r=0; r<values.length; r++){
        var row = values[r] || {};
        var pid = String(row.project_id || '').trim();
        if (!pid || !pmap[pid]) continue;
        var obj = {};
        Object.keys(row).forEach(function(k){ obj[k] = row[k]; });

        if (map['is_deleted'] != null && truthy_(obj.is_deleted)) continue;

        // join: 항상 year/business_name 제공(프론트 list에서 사용)
        obj.year = pmap[pid].year;
        obj.start_date = pmap[pid].start_date;
        obj.business_name = pmap[pid].business_name;

        out.push(obj);
      }

      // 정렬: ✅ 공통정렬 + 탭별 보조정렬
      var FIN_ORDER = { '보조금':0, '대응자금(현금)':1, '대응자금(현물)':2, '기업부담금(현금)':3, '기업부담금(현물)':4, '기타자금':5 };
      var PROG_CAT_ORDER = { '핵심(주)':0, '일반(보조)':1 };
      var KPI_CAT_ORDER  = { '창업성과':0, '운영성과':1, '기타성과':2 };
      var MEX_ORDER      = { '총괄기관':0, '전담기관':1, '주관기관':2 };
      out.sort(function(a,b){
        var c = PROJECT_cmpCommon_(a,b);
        if (c) return c;

        // 탭별 보조정렬
        if (sheetName === 'Project_Finance'){
          c = PROJECT_cmpOrder_(a.budget_category, b.budget_category, FIN_ORDER);
          if (c) return c;
          return 0;
        }
        if (sheetName === 'Project_Program'){
          c = PROJECT_cmpOrder_(a.category, b.category, PROG_CAT_ORDER);
          if (c) return c;
          return PROJECT_cmpNumStr_(a.program_id, b.program_id);
        }
        if (sheetName === 'Project_Kpi'){
          c = PROJECT_cmpOrder_(a.category, b.category, KPI_CAT_ORDER);
          if (c) return c;
          return PROJECT_cmpNumStr_(a.kpi_id, b.kpi_id);
        }
        if (sheetName === 'Project_Member_Ex'){
          c = PROJECT_cmpOrder_(a.agency_category, b.agency_category, MEX_ORDER);
          if (c) return c;
          return 0;
        }
        if (sheetName === 'Project_Member_In'){
          // employee_id 오름차순 (00001,00002,...)
          return PROJECT__cmpText_(a.employee_id, b.employee_id);
        }
        // Project_Opi 포함 기타는 공통정렬만
        return 0;
      });

      return out;
    }

    // 2) 하위 탭 데이터
    var financeRows = readByProjectIds_('Project_Finance');
    var programRows = readByProjectIds_('Project_Program');
    var kpiRows     = readByProjectIds_('Project_Kpi');
    var memberExRows = readByProjectIds_('Project_Member_Ex');
    var memberInRows = readByProjectIds_('Project_Member_In');

    // 3) OPI는 프로젝트당 0~1행 → 프로젝트 기준 1행 보장(없으면 빈값)
    var opiRaw = readByProjectIds_('Project_Opi');
    var opiMap = {};
    opiRaw.forEach(function(r){
      var pid = String(r && r.project_id || '').trim();
      if (!pid) return;
      opiMap[pid] = r; // 마지막 값 우선
    });

    var opiRows = [];
    projects.forEach(function(p){
      var pid = String(p && p.project_id || '').trim();
      if (!pid) return;
      var row = opiMap[pid] || { project_id: pid, year: p.year, business_name: p.business_name };
      // 혹시 join이 안 붙은 경우 대비
      row.year = p.year;
      row.business_name = p.business_name;
      opiRows.push(row);
    });

    return _jsonSafeKst_({
      ok: true,
      total: base.total,
      page: base.page,
      pageSize: base.pageSize,
      projectRows: projects,
      financeRows: financeRows,
      programRows: programRows,
      kpiRows: kpiRows,
      opiRows: opiRows,
      memberExRows: memberExRows,
      memberInRows: memberInRows
    });

  } catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  }
}

/**
 * ✅ 프로젝트 소프트삭제 (Project 부모만 소프트삭제)
 * - 자식 시트는 유지(자식 is_deleted는 자식 자체 삭제 시에만 변경)
 * - 조회는 부모 is_deleted=0 기준이므로 부모 삭제 시 노출되지 않음
 */
function PROJECT_delete(projectId){
  try{
    // 권한은 일단 저장과 동일하게 처리(원하면 'btn:project:delete'로 분리)
    var me = DB_assertPerm_('btn:project:create');

    projectId = String(projectId || '').trim();
    if (!projectId) return { ok:false, message:'project_id가 필요합니다.' };

    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      // 1) Project 삭제(소프트/하드)
      var psh = DB_sheet_(PROJECT_SHEET_NAME);
      var pHeader = DB_header_(psh);
      var pMap = DB_headerMap_(pHeader);

      if (pMap[PROJECT_ID_FIELD] == null){
        throw new Error('Project 시트에 project_id 컬럼이 없습니다.');
      }

      var deletedProject = null;

      // ✅ is_deleted 컬럼이 있으면 소프트삭제
      if (pMap['is_deleted'] != null){
        var rowNo = DB_findRowIndexByIdUnlocked_(psh, PROJECT_ID_FIELD, projectId);
        if (!rowNo){
          return { ok:false, message:'삭제할 프로젝트를 찾을 수 없습니다. project_id=' + projectId };
        }

        var prow = psh.getRange(rowNo, 1, 1, pHeader.length).getValues()[0];
        prow[pMap['is_deleted']] = 1;
        if (pMap['updated_at'] != null) prow[pMap['updated_at']] = new Date();
        if (pMap['updated_by'] != null) prow[pMap['updated_by']] = DB_actorLabel_(me);
        psh.getRange(rowNo, 1, 1, pHeader.length).setValues([prow]);

        deletedProject = { soft: true, row: rowNo };
      } else {
        // ✅ is_deleted 컬럼이 없으면 기존 하드삭제 유지
        // (DB_deleteWhereUnlocked_가 (sh, col, value, actor) 시그니처면 actor도 전달)
        var hardDeleted = DB_deleteWhereUnlocked_(psh, pMap[PROJECT_ID_FIELD] + 1, projectId, me);
        if (!hardDeleted){
          return { ok:false, message:'삭제할 프로젝트를 찾을 수 없습니다. project_id=' + projectId };
        }
        deletedProject = { hard: true, deleted: hardDeleted };
      }
      DB_invalidateSheetCache_(PROJECT_SHEET_NAME);
      if (typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Project');

      return { ok: true, project_id: projectId, deleted: { project: deletedProject } };

    } finally {
      lock.releaseLock();
    }

  } catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  }
}

/**
 * ✅ 프로젝트 표시/삭제 관리(관리자 모달용)
 * - visibleRows: is_deleted=0 인 프로젝트(표시/미표시 포함)
 * - deletedRows: is_deleted=1 인 프로젝트(복구 대상)
 */
function PROJECT_adminListVisibility(payload){
  try{
    DB_assertPerm_('btn:project:create');

    var t = DB_readRows_(PROJECT_SHEET_NAME);
    var header = t.header || [];
    var values = t.rows || [];
    var map = DB_headerMap_(header);

    if (map['is_deleted'] == null){
      return { ok:false, message:'Project 시트에 is_deleted 컬럼이 없습니다.' };
    }
    if (map['is_visible'] == null){
      // is_visible 컬럼이 없으면 관리자 모달이 의미가 없으므로 에러
      return { ok:false, message:'Project 시트에 is_visible 컬럼이 없습니다. (is_visible 컬럼을 생성해주세요)' };
    }

    if (!header.length || !values.length) return _jsonSafeKst_({ ok:true, visibleRows:[], deletedRows:[] });

    function truthy_(v){
      if (v === true) return true;
      var s = String(v ||'').trim().toLowerCase();
      return (s === 'true' || s === 'y' || s === 'yes' || s === '1');
    }
    function fmtDate_(v){
      if (!v) return '';
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, APP_TZ, 'yyyy-MM-dd');
      }
      return String(v);
    }

    var visibleRows = [];
    var deletedRows = [];

    for (var r=0; r<values.length; r++){
      var row = values[r] || {};
      var obj = {};
      Object.keys(row).forEach(function(k){
        var v = row[k];
        if (k === 'start_date' || k === 'end_date') v = fmtDate_(v);
        obj[k] = v;
      });

      // project_id 없으면 스킵
      if (!String(obj.project_id || '').trim()) continue;

      if (truthy_(obj.is_deleted)) deletedRows.push(obj);
      else visibleRows.push(obj);
    }

    // 정렬: year desc → business_name asc → project_id desc
    function cmp_(a,b){
      var ay = parseInt(a.year, 10), by = parseInt(b.year, 10);
      if (!isNaN(ay) && !isNaN(by) && ay !== by) return by - ay;
      var an = String(a.business_name || '');
      var bn = String(b.business_name || '');
      if (an !== bn) return (an > bn ? 1 : -1);
      var aid = parseInt(a.project_id, 10), bid = parseInt(b.project_id, 10);
      if (!isNaN(aid) && !isNaN(bid) && aid !== bid) return bid - aid;
      return 0;
    }
    visibleRows.sort(cmp_);
    deletedRows.sort(cmp_);

    return _jsonSafeKst_({ ok:true, visibleRows:visibleRows, deletedRows:deletedRows });

  } catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  }
}

/**
 * ✅ 프로젝트 표시/삭제 관리 저장
 * payload:
 *  - visibles: [{project_id, is_visible}]  // is_deleted=0 대상, 동일행 업데이트
 *  - restoreIds: [project_id, ...]         // is_deleted=1 → 0 복구(부모만)
 */
function PROJECT_adminSaveVisibility(payload){
  try{
    var me = DB_assertPerm_('btn:project:create');
    payload = payload || {};
    var visibles = Array.isArray(payload.visibles) ? payload.visibles : [];
    var restoreIds = Array.isArray(payload.restoreIds) ? payload.restoreIds : [];
    var hardDeleteIds = Array.isArray(payload.hardDeleteIds) ? payload.hardDeleteIds : [];

    var sh = DB_sheet_(PROJECT_SHEET_NAME);
    var header = DB_header_(sh);
    var map = DB_headerMap_(header);

    if (map['is_visible'] == null) return { ok:false, message:'Project 시트에 is_visible 컬럼이 없습니다.' };
    if (map['is_deleted'] == null) return { ok:false, message:'Project 시트에 is_deleted 컬럼이 없습니다.' };

    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try{
      // --- helper: build {project_id -> rowNo(1-based)} ---
      function _buildRowMapById_(sh, col1Based){
        var out = {};
        var last = sh.getLastRow();
        if (last < 2) return out;
        var vals = sh.getRange(2, col1Based, last - 1, 1).getValues();
        for (var i=0; i<vals.length; i++){
          var v = String(vals[i][0] || '').trim();
          if (v) out[v] = i + 2;
        }
        return out;
      }

      // --- helper: HARD delete rows where (col == value) ---
      function _hardDeleteWhere_(sheetName, fieldName, matchValue){
        var s = DB_sheet_(sheetName);
        var h = DB_header_(s);
        var m = DB_headerMap_(h);
        if (m[fieldName] == null) return 0;
        var last = s.getLastRow();
        if (last < 2) return 0;
        var col = m[fieldName] + 1; // 1-based
        var vals = s.getRange(2, col, last - 1, 1).getValues();
        var mv = String(matchValue || '').trim();
        var delRows = [];
        for (var i=0; i<vals.length; i++){
          if (String(vals[i][0] || '').trim() === mv) delRows.push(i + 2);
        }
        delRows.sort(function(a,b){ return b-a; });
        delRows.forEach(function(r){ s.deleteRow(r); });
        if (delRows.length) DB_invalidateSheetCache_(sheetName);
        return delRows.length;
      }

      function _hardDeleteBundle_(projectId){
        projectId = String(projectId || '').trim();
        if (!projectId) return;
        // (1) children
        (PROJECT_BUNDLE || []).forEach(function(cfg){
          try{ _hardDeleteWhere_(cfg.sheet, 'project_id', projectId); }catch(e){}
        });
        // (2) master(Project)
        try{ _hardDeleteWhere_(PROJECT_SHEET_NAME, PROJECT_ID_FIELD, projectId); }catch(e){}
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

      // --- 1) ✅ 완전삭제: master + children(행 자체 삭제) ---
      hardDeleteIds.forEach(function(projectId){
        projectId = String(projectId || '').trim();
        if (!projectId) return;
        _hardDeleteBundle_(projectId);
      });

      // --- 2) master(Project) 변경사항을 메모리에서 일괄 반영 후 1회 setValues ---
      var pidCol = map[PROJECT_ID_FIELD] + 1;
      var rowMap = _buildRowMapById_(sh, pidCol);
      var last = sh.getLastRow();
      var values = (last >= 2) ? sh.getRange(2, 1, last - 1, header.length).getValues() : [];
      var changedMaster = false;

      // --- 2.1) is_visible 업데이트(동일행) ---
      visibles.forEach(function(it){
        var pid = String(it && it.project_id || '').trim();
        if (!pid) return;
        var rowNo = rowMap[pid] || 0;
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
      });

      // --- 2.2) 복구: Project 부모만 is_deleted=0 ---

      restoreIds.forEach(function(projectId){
        projectId = String(projectId || '').trim();
        if (!projectId) return;
        var rowNo = rowMap[projectId] || 0;
        if (!rowNo) return;
        var idx = rowNo - 2;
        if (idx < 0 || idx >= values.length) return;
        var row = values[idx];

        // Project is_deleted=0 + is_visible=0(활성)로 복구
        if (String(row[map['is_deleted']] || '') !== '0') {
          row[map['is_deleted']] = 0;
          changedMaster = true;
        }
        if (String(row[map['is_visible']] || '') !== '0') {
          row[map['is_visible']] = 0;
          changedMaster = true;
        }

      });
      if (changedMaster && values.length) sh.getRange(2, 1, values.length, header.length).setValues(values);
      DB_invalidateSheetCache_(PROJECT_SHEET_NAME);
      if (typeof DB_bumpDataVersion_ === 'function') DB_bumpDataVersion_('Project');

      return { ok:true };
    } finally {
      lock.releaseLock();
    }

  } catch(err){
    return { ok:false, message: (err && err.message) ? err.message : String(err) };
  }
}


var APP_TZ = 'Asia/Seoul';

function _jsonSafeKst_(obj){
  function walk(x, key){
    // Date → KST 문자열
    if (x instanceof Date){
      // date-only 필드 규칙(필요시 더 추가)
      if (key && (key === 'start_date' || key === 'end_date' || /_date$/.test(key))) {
        return Utilities.formatDate(x, APP_TZ, 'yyyy-MM-dd');
      }
      // datetime
      return Utilities.formatDate(x, APP_TZ, 'yyyy-MM-dd HH:mm:ss');
    }

    if (x === undefined) return null;

    if (Array.isArray(x)) {
      return x.map(function(v){ return walk(v, key); });
    }

    if (x && typeof x === 'object') {
      var o = {};
      Object.keys(x).forEach(function(k){
        o[k] = walk(x[k], k);
      });
      return o;
    }

    return x;
  }

  // 안전장치(특수객체 제거)까지 유지
  return JSON.parse(JSON.stringify(walk(obj, '')));
}
