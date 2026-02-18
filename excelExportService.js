/** excelExportService.js */
/*숨길 필드*/
var PROJECT_EXPORT_HIDE_FIELDS_ = {
  Project: [
    'project_id','desc','created_at','created_by','updated_at','updated_by','is_deleted','deleted_at','deleted_by','is_visible'
  ],
  Project_Finance: [
    'finance_id','project_id','created_at','created_by','updated_at','updated_by','is_deleted','deleted_at','deleted_by'
  ],
  Project_Program: [
    'program_id','project_id','created_at','created_by','updated_at','updated_by','is_deleted','deleted_at','deleted_by'
  ],
  Project_Kpi: [
    'kpi_id','project_id','created_at','created_by','updated_at','updated_by','is_deleted','deleted_at','deleted_by'
  ],
  Project_Opi: [
    'opi_id','project_id','created_at','created_by','updated_at','updated_by','is_deleted','deleted_at','deleted_by'
  ],
  Project_Member_Ex: [
    'member_ex_id','project_id','created_at','created_by','updated_at','updated_by','is_deleted','deleted_at','deleted_by'
  ],
  Project_Member_In: [
    'member_in_id','project_id','created_at','created_by','updated_at','updated_by','is_deleted','deleted_at','deleted_by'
  ]
};

// 엑셀 헤더 라벨(시트별): key(시트 헤더명) -> label(엑셀 표기명)
var PROJECT_EXPORT_HEADER_LABELS_ = {
  Project: {
    start_date: '시작일',
    end_date: '종료일',
    period: '소요기간',
    budget_grant: '보조금',
    budget_match_cash: '대응자금(현금)',
    budget_match_spot: '대응자금(현물)',
    budget_total_grant_match: '보조금+대응',
    budget_charge_cash: '기업부담금(현금)',
    budget_charge_spot: '기업부담금(현물)',
    budget_etc: '기타자금',
    budget_total: '총예산',
    supervising_agency: '총괄기관',
    managing_agency: '전담기관',
    executing_agency: '주관기관',
    executing_pmo: '주관기관 전담조직',
    purpose: '목적',
    target: '대상',
    content: '진행내용(요약)',
    nature: '성격',
    type: '운영방식',
    process: '수행단계',
    selection_info: '선정세부정보'
  },

  Project_Finance: {
    budget_category: '예산구분',
    budget_source: '예산출처',
    budget_system: '예산시스템',
    budget_amount: '예산금액',
    accounting_category: '회계구분',
    accounting_name: '예산부서',
    account_bank: '은행',
    account_number: '계좌번호',
    account_owner: '예금주',
    account_status: '계좌상태',
    account_start_date: '계좌개설일',
    account_start_number: '계좌개설공문',
    account_end_date: '계좌해지일',
    account_end_number: '계좌해지공문'
  },

  Project_Program: {
    category: '구분',
    nature: '성격',
    name: '프로그램명',
    start_date: '시작일',
    end_date: '종료일',
    budget_amount: '예산금액',
    target: '대상',
    content: '내용',
    goal: '목표',
    result: '실적'
  },

  Project_Kpi: {
    category: '구분',
    name: '성과지표',
    goal: '목표',
    result: '실적'
  },

  Project_Opi: {
    support_prefounder: '지원_예비창업자',
    support_founder: '지원_기창업자',
    support_total: '지원_합계',

    startup_new: '창업_신규 창업',
    "startup_m&a": '창업_M&A',
    revenue_domestic: '매출_국내매출',
    revenue_overseas: '매출_수출',
    revenue_total: '매출_합계',

    employment_exist: '고용_기존고용',
    employment_new: '고용_신규고용',
    employment_total: '고용_합계',

    investment_count: '투자_유치수',
    investment_amount: '투자_유치금액',

    ip_domestic_app: 'IP_국내출원_합계',
    ip_domestic_reg: 'IP_국내등록_합계',
    ip_pct: 'IP_PCT국제출원_합계',
    ip_overseas_app: 'IP_해외출원_합계',
    ip_overseas_reg: 'IP_해외등록_합계',

    ip_domestic_app_pantent: 'IP_국내출원_특허',
    ip_domestic_app_utility: 'IP_국내출원_실용신안',
    ip_domestic_app_trademark: 'IP_국내출원_상표',
    ip_domestic_app_design: 'IP_국내출원_디자인',

    ip_domestic_reg_pantent: 'IP_국내등록_특허',
    ip_domestic_reg_utility: 'IP_국내등록_실용신안',
    ip_domestic_reg_trademark: 'IP_국내등록_상표',
    ip_domestic_reg_design: 'IP_국내등록_디자인',
    ip_domestic_reg_copyright: 'IP_국내등록_저작권',

    ip_pct_pantent: 'IP_PCT국제출원_특허',

    ip_overseas_app_pantent: 'IP_해외출원_특허',
    ip_overseas_app_utility: 'IP_해외출원_실용신안',
    ip_overseas_app_trademark: 'IP_해외출원_상표',
    ip_overseas_app_design: 'IP_해외출원_디자인',
    ip_overseas_app_copyright: 'IP_해외출원_저작권',

    ip_overseas_reg_pantent: 'IP_해외등록_특허',
    ip_overseas_reg_utility: 'IP_해외등록_실용신안',
    ip_overseas_reg_trademark: 'IP_해외등록_상표',
    ip_overseas_reg_design: 'IP_해외등록_디자인',
    ip_overseas_reg_copyright: 'IP_해외등록_저작권'
  },

  Project_Member_Ex: {
    agency_category: '기관구분',
    company: '회사',
    department: '부서',
    position: '직위',
    name: '성명',
    company_number: '회사전화번호',
    phone_number: '휴대전화번호',
    email: '이메일',
    start_date: '참여시작일',
    end_date: '참여종료일',
    role: '수행업무'
  },

  Project_Member_In: {
    employee_id: '사번',
    name: '성명',
    company: '회사',
    department: '부서',
    position: '직위',
    start_date: '참여시작일',
    end_date: '참여종료일',
    role: '수행업무'
  }
};

/* =========================
 * Employee Export
 * ========================= */
// 숨길 필드(시트별)
var EMPLOYEE_EXPORT_HIDE_FIELDS_ = {
  Employee: [
    // 기본적으로 A/B(사번/성명)으로 강제 출력하므로 본문에서는 중복 제거
    'employee_id','name',
    // 감사/시스템
    'created_at','created_by','updated_at','updated_by',
    'is_deleted','deleted_at','deleted_by', 'is_visible'
  ],
  Employee_Position: [
    'position_id','employee_id',
    'created_at','created_by','updated_at','updated_by',
    'is_deleted','deleted_at','deleted_by'
  ],
  Employee_Agreement: [
    'agreement_id','employee_id',
    'created_at','created_by','updated_at','updated_by',
    'is_deleted','deleted_at','deleted_by'
  ],
  Employee_Experience: [
    'experience_id','employee_id',
    'created_at','created_by','updated_at','updated_by',
    'is_deleted','deleted_at','deleted_by'
  ],
  Employee_Education: [
    'education_id','employee_id',
    'created_at','created_by','updated_at','updated_by',
    'is_deleted','deleted_at','deleted_by'
  ],
  Employee_Training: [
    'training_id','employee_id',
    'created_at','created_by','updated_at','updated_by',
    'is_deleted','deleted_at','deleted_by'
  ],
  Employee_Qualification: [
    'qualification_id','employee_id',
    'created_at','created_by','updated_at','updated_by',
    'is_deleted','deleted_at','deleted_by'
  ]
};

// (선택) 엑셀 헤더 라벨 매핑
var EMPLOYEE_EXPORT_HEADER_LABELS_ = {
  Employee: {
    personal_id: '주민등록번호',
    phone_number: '휴대전화번호',
    company_number: '내선번호',
    email: '이메일',
    salary_account: '급여계좌',
    trip_account: '출장비계좌',
    company_card: '법인카드',
    company_card_account: '법인카드계좌',
    expertise_status: '직무전문성 상태',
    expertise_date: '직무전문성 반영일',
    company: '회사',
    department: '부서',
    position: '직위',
    agreement_start_date: '계약시작일',
    agreement_end_date: '계약종료일',
    agreement_period: '계약기간',
    agreement_period_now: '재직기간',
    experience_approval_period: '경력기간',
    working_period: '총근무연수',
    working_yearcount: '총근무연차',
    category: '고용구분',
    status: '고용상태',
    manage: '관리주체'
  },
  Employee_Position: {
    name: '직위명',
    start_date: '적용시작일',
    end_date: '적용종료일',
    period: '적용기간'
  },
  Employee_Agreement: {
    category: '계약구분',
    start_date: '계약시작일',
    end_date: '계약종료일',
    period: '계약기간'
  },
  Employee_Experience: {
    company: '회사',
    department: '부서',
    position: '직위',
    role: '수행업무',
    working_start_date: '근무시작일',
    working_end_date: '근무종료일',
    working_period: '근무기간',
    category: '경력구분',
    period: '경력기간'
  },
  Employee_Education: {
    category: '학력구분',
    school: '학교',
    major: '전공',
    degree: '학위',
    start_date: '입학일자',
    end_date: '졸업일자',
    expertise_apply: '직무전문성여부',
    expertise_date: '직무전문성반영일'
  },
  Employee_Training: {
    category: '교육구분',
    name: '교육명',
    issue_date: '이수일자',
    issuer: '교육기관'
  },
  Employee_Qualification: {
    category: '자격구분',
    name: '자격명',
    issue_date: '자격취득(발급)일자',
    issuer: '발급기관',
    expertise_apply: '직무전문성여부',
    expertise_date: '직무전문성반영일'
  }
};

// ✅ 시트별 출력 컬럼 순서(사번/성명은 A/B 고정)
//    - 요청한 순서로 헤더/데이터를 정렬
//    - DB에 없는 프론트 계산값도 key로 포함하면 엑셀 컬럼으로 생성됨
var EMPLOYEE_EXPORT_COLUMN_ORDER_ = {
  Employee: [
    'personal_id',
    'company_number',
    'phone_number',
    'email',
    'salary_account',
    'trip_account',
    'company_card',
    'company_card_account',
    'expertise_status',
    'expertise_date',
    'company',
    'department',
    'position',
    'agreement_start_date',
    'agreement_end_date',
    'agreement_period',
    'agreement_period_now',
    'experience_approval_period',
    'working_period',
    'working_yearcount',
    'category',
    'status',
    'manage'
  ],
  Employee_Position: ['name','start_date','end_date','period'],
  Employee_Agreement: ['category','start_date','end_date','period'],
  Employee_Experience: ['company','department','position','role','working_start_date','working_end_date','working_period','category','period'],
  Employee_Education: ['category','school','major','degree','start_date','end_date','expertise_apply','expertise_date'],
  Employee_Training: ['category','name','issue_date','issuer'],
  Employee_Qualification: ['category','name','issue_date','issuer','expertise_apply','expertise_date']
};


function ExcelExportService_defaultFileName_(req){
  var now = new Date();
  var tz = Session.getScriptTimeZone() || 'Asia/Seoul';
  var stamp = Utilities.formatDate(now, tz, 'yyyyMMdd_HHmmss');
  var d = String((req && req.domain) ? req.domain : 'EXPORT');
  var m = String((req && req.mode) ? req.mode : '');
  return d + '_' + m + '_' + stamp + '.xls';
}

/**
 * ✅ 2단계: 실데이터 workbook 생성
 */
function ExcelExportService_buildWorkbook_(req){
  req = req || {};
  var domain = String(req.domain || '').toUpperCase();
  var mode   = String(req.mode || '').toUpperCase();
  var opt    = req.options || {};

  if (domain === 'PROJECT') {
    if (mode === 'DETAIL') {
      return ProjectExport_buildDetailWorkbook_(req);
    }
    // 기본은 LIST
    return ProjectExport_buildListWorkbook_(req);
  }

  if (domain === 'EMPLOYEE') {
    if (mode === 'DETAIL') {
      return EmployeeExport_buildDetailWorkbook_(req);
    }
    return EmployeeExport_buildListWorkbook_(req);
  }

  if (domain === 'PAYROLL') {
    // ✅ UI workbook이 오면 서버 재계산 없이 그대로 사용
    if (req.workbook && req.workbook.sheets) {
      return PayrollExport_normalizeUiWorkbook_(req.workbook);
    }
    // fallback: 기존 서버 계산 방식 유지(혹시 UI workbook이 안 오는 경우)
    return PayrollExport_buildListWorkbook_(req);   
  }

  // 다른 도메인은 다음 단계에서 확장
  return {
    sheets: [
      { name:'테스트', values:[ ['message'], ['지원하지 않는 domain: ' + domain] ] }
    ]
  };
}

function Export_buildUiSheetOrderMap_(req){
  req = req || {};
  var src = req.uiSheetOrders || {};
  var out = {};
  if (!src || typeof src !== 'object') return out;
  Object.keys(src).forEach(function(sheetName){
    var list = Array.isArray(src[sheetName]) ? src[sheetName] : [];
    var map = {};
    var n = 0;
    for (var i=0; i<list.length; i++){
      var id = String(list[i] || '').trim();
      if (!id || Object.prototype.hasOwnProperty.call(map, id)) continue;
      map[id] = n++;
    }
    if (n > 0) out[sheetName] = map;
  });
  return out;
}

function Export_pkFieldBySheet_(sheetName){
  var m = {
    Project: 'project_id',
    Project_Finance: 'finance_id',
    Project_Program: 'program_id',
    Project_Kpi: 'kpi_id',
    Project_Opi: 'opi_id',
    Project_Member_Ex: 'member_ex_id',
    Project_Member_In: 'member_in_id',
    Employee: 'employee_id',
    Employee_Position: 'position_id',
    Employee_Agreement: 'agreement_id',
    Employee_Experience: 'experience_id',
    Employee_Education: 'education_id',
    Employee_Training: 'training_id',
    Employee_Qualification: 'qualification_id'
  };
  return m[String(sheetName || '').trim()] || '';
}

function Export_employeeSortDateFieldsBySheet_(sheetName){
  var m = {
    Employee_Position: ['start_date'],
    Employee_Agreement: ['start_date'],
    Employee_Experience: ['working_start_date'],
    Employee_Education: ['start_date', 'education_start_date'],
    Employee_Training: ['issue_date', 'date'],
    Employee_Qualification: ['issue_date', 'acquisition_date']
  };
  return m[String(sheetName || '').trim()] || [];
}

function Export_toYmdTs_(v){
  if (v == null || v === '') return Number.MAX_SAFE_INTEGER;
  if (Object.prototype.toString.call(v) === '[object Date]'){
    var d0 = v;
    var t0 = d0.getTime();
    return isFinite(t0) ? t0 : Number.MAX_SAFE_INTEGER;
  }
  var s = String(v).trim();
  if (!s) return Number.MAX_SAFE_INTEGER;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m){
    var y = Number(m[1]);
    var mo = Number(m[2]) - 1;
    var d = Number(m[3]);
    return new Date(y, mo, d).getTime();
  }
  var t = Date.parse(s);
  return isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

// =========================
// PAYROLL UI Workbook Normalize
// - UI에서 "3,000,000원"으로 렌더된 문자열을 엑셀 숫자(Number)로 변환
// - 대상 시트: '급여(예정산출)', '급여(지급완료)'
// - 대상 컬럼: 급여/보험/합계/퇴직금 등 숫자 컬럼만
// =========================
function PayrollExport_normalizeUiWorkbook_(wb){
  wb = wb || {};
  var sheets = Array.isArray(wb.sheets) ? wb.sheets : [];

  // 숫자화 대상 헤더(표기명 기준)
  var NUM_HEADERS = {
    // budget
    '기준연봉': true,
    '기본급': true,
    '직위수당': true,
    '자격수당': true,
    '고정급 합계': true,
    '초과근무수당': true,
    '월급여 합계': true,
    '국민연금': true,
    '건강보험': true,
    '고용보험': true,
    '산재보험': true,
    '4대 합계': true,
    '월급여+4대': true,
    '퇴직금': true,
    '총인건비(월급여+4대+퇴직금)': true,
    // actual (중복 포함)
    '고정급': true
  };

  function isTargetSheet(name){
    name = String(name || '').trim();
    return (name === '급여(예정산출)' || name === '급여(지급완료)');
  }

  function toNumberOrKeep_(v){
    if (v === null || v === undefined) return v;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v;
    var s = String(v).trim();
    if (!s) return v;           // 빈칸은 그대로(엑셀 빈칸 유지)
    if (s === '-') return '';   // UI에서 '-' 쓰면 공백으로

    // 콤마/원/공백 등 제거 후 숫자만
    var t = s.replace(/,/g,'').replace(/[^\d.\-]/g,'');
    if (!t) return v;
    var n = Number(t);
    return isFinite(n) ? n : v;
  }

  // wb 복사(원본 보호)
  var out = { sheets: [] };
  sheets.forEach(function(sh){
    sh = sh || {};
    var name = String(sh.name || '').trim();
    var values = Array.isArray(sh.values) ? sh.values : [];

    // 타겟 시트 아니면 그대로
    if (!isTargetSheet(name) || values.length < 2) {
      out.sheets.push({ name: name, values: values });
      return;
    }

    var header = Array.isArray(values[0]) ? values[0] : [];
    // 숫자화 대상 컬럼 인덱스 계산
    var idxs = [];
    for (var c=0; c<header.length; c++){
      var h = String(header[c] || '').trim();
      if (NUM_HEADERS[h]) idxs.push(c);
    }

    // 변환할 컬럼이 없으면 그대로
    if (!idxs.length){
      out.sheets.push({ name: name, values: values });
      return;
    }

    // deep-ish copy + numeric convert
    var newValues = values.map(function(row, r){
      if (!Array.isArray(row)) return row;
      if (r === 0) return row.slice(); // header
      var nr = row.slice();
      for (var i=0; i<idxs.length; i++){
        var col = idxs[i];
        nr[col] = toNumberOrKeep_(nr[col]);
      }
      return nr;
    });

    out.sheets.push({ name: name, values: newValues });
  });

  return out;
}


/* =========================
 * Project Export
 * ========================= */

function ProjectExport_buildListWorkbook_(req){
  var opt = req.options || {};
  var includeOPI = (opt.includeOPI !== false);
  var includeMembers = (opt.includeMembers !== false);

  // ✅ UI가 넘겨준 화면 목록 pids(있으면)
  var uiPids = Array.isArray(req.pids)
    ? req.pids.map(function(v){ return String(v||'').trim(); }).filter(Boolean)
    : [];

  // ✅ 필터가 실제로 활성인지
  var filtersActive = Export_hasAnyCriteriaInFilters_(req.filters);

  var pids = [];

  // 1) 필터가 활성이라면: 서버에서 "필터 전체 결과"를 계산(페이지 넘어도 전체)
  if (filtersActive) {
    try {
      var listRes = null;

      if (req.filters && typeof PROJECT_listForExport_ === 'function') {
        listRes = PROJECT_listForExport_(req.filters);
      } else if (typeof PROJECT_list === 'function') {
        listRes = PROJECT_list(req.filters || {});
      }

      if (listRes && listRes.ok) {
        var arr = listRes.items || listRes.rows || [];
        pids = arr.map(function(it){ return String(it.project_id || '').trim(); }).filter(Boolean);
      }
    } catch(e){}

    // ✅ 서버 필터 결과가 비었는데 화면에는 목록이 있다면: 화면 목록으로 fallback
    if (!pids.length && uiPids.length) {
      pids = uiPids.slice();
    }

    // ✅ 필터인데도 최종 pids가 비면: 전체 fallback 금지(헤더만 나오게)
    if (!pids.length) {
      pids = ['__NO_MATCH__'];
    }
  } else {
    // 2) 필터 비활성(=전체 다운로드 정책 유지): 기존처럼 전체 fallback 허용
    try {
      var listRes2 = null;
      if (req.filters && typeof PROJECT_list === 'function') {
        // 혹시 year/q 같은 payload로 들어오는 케이스가 있으면 여기서 사용
        listRes2 = PROJECT_list(req.filters || {});
      }
      if (listRes2 && listRes2.ok) {
        var arr2 = listRes2.items || listRes2.rows || [];
        pids = arr2.map(function(it){ return String(it.project_id || '').trim(); }).filter(Boolean);
      }
    } catch(e){}

    if (!pids.length) {
      // fallback: Project 시트 전체 project_id
      var tProj = Export_readSheetTable_('Project');
      var pidIdx = Export_indexOf_(tProj.headers, 'project_id');
      if (pidIdx >= 0) {
        tProj.rows.forEach(function(r){
          var v = String(r[pidIdx] || '').trim();
          if (v) pids.push(v);
        });
      }
    }
  }

  // project_id -> 정렬우선순위
  var orderMap = {};
  for (var i=0; i<pids.length; i++) orderMap[pids[i]] = i;
  var uiSheetOrderMap = Export_buildUiSheetOrderMap_(req);

  // 2) 각 시트 구성
  var sheets = [];
  var projectMetaMap = Export_buildProjectMetaMap_(pids);

  sheets.push(Export_buildSheetUiLike_('기본정보', 'Project', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project, PROJECT_EXPORT_HEADER_LABELS_.Project, uiSheetOrderMap));
  sheets.push(Export_buildSheetUiLike_('예산회계', 'Project_Finance', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Finance, PROJECT_EXPORT_HEADER_LABELS_.Project_Finance, uiSheetOrderMap));
  sheets.push(Export_buildSheetUiLike_('프로그램', 'Project_Program', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Program, PROJECT_EXPORT_HEADER_LABELS_.Project_Program, uiSheetOrderMap));
  sheets.push(Export_buildSheetUiLike_('핵심성과', 'Project_Kpi', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Kpi, PROJECT_EXPORT_HEADER_LABELS_.Project_Kpi, uiSheetOrderMap));

  if (includeMembers) {
    sheets.push(Export_buildSheetUiLike_('참여인력_외부', 'Project_Member_Ex', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Member_Ex, PROJECT_EXPORT_HEADER_LABELS_.Project_Member_Ex, uiSheetOrderMap));
    sheets.push(Export_buildSheetUiLike_('참여인력_내부', 'Project_Member_In', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Member_In, PROJECT_EXPORT_HEADER_LABELS_.Project_Member_In, uiSheetOrderMap));
  }

  if (includeOPI) {
    sheets.push(Export_buildSheetUiLike_('창업성과', 'Project_Opi', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Opi, PROJECT_EXPORT_HEADER_LABELS_.Project_Opi, uiSheetOrderMap));
  }

  return { sheets: sheets };
}

function ProjectExport_buildDetailWorkbook_(req){
  var opt = req.options || {};
  var includeOPI = (opt.includeOPI !== false);
  var includeMembers = (opt.includeMembers !== false);

  var pid = String(req.id || '').trim();
  if (!pid) {
    return { sheets:[ { name:'오류', values:[ ['message'], ['DETAIL 모드에서는 id(project_id)가 필요합니다.'] ] } ] };
  }

  var pids = [pid];
  var orderMap = {}; orderMap[pid] = 0;
  var uiSheetOrderMap = Export_buildUiSheetOrderMap_(req);

  var sheets = [];
  var projectMetaMap = Export_buildProjectMetaMap_(pids);
  sheets.push(Export_buildSheetUiLike_('기본정보', 'Project', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project, PROJECT_EXPORT_HEADER_LABELS_.Project, uiSheetOrderMap));
  sheets.push(Export_buildSheetUiLike_('예산회계', 'Project_Finance', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Finance, PROJECT_EXPORT_HEADER_LABELS_.Project_Finance, uiSheetOrderMap));
  sheets.push(Export_buildSheetUiLike_('프로그램', 'Project_Program', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Program, PROJECT_EXPORT_HEADER_LABELS_.Project_Program, uiSheetOrderMap));
  sheets.push(Export_buildSheetUiLike_('핵심성과', 'Project_Kpi', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Kpi, PROJECT_EXPORT_HEADER_LABELS_.Project_Kpi, uiSheetOrderMap));

  if (includeMembers) {
    sheets.push(Export_buildSheetUiLike_('참여인력_외부', 'Project_Member_Ex', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Member_Ex, PROJECT_EXPORT_HEADER_LABELS_.Project_Member_Ex, uiSheetOrderMap));
    sheets.push(Export_buildSheetUiLike_('참여인력_내부', 'Project_Member_In', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Member_In, PROJECT_EXPORT_HEADER_LABELS_.Project_Member_In, uiSheetOrderMap));
  }
  if (includeOPI) sheets.push(Export_buildSheetUiLike_('창업성과', 'Project_Opi', pids, orderMap, projectMetaMap, PROJECT_EXPORT_HIDE_FIELDS_.Project_Opi, PROJECT_EXPORT_HEADER_LABELS_.Project_Opi, uiSheetOrderMap));

  return { sheets: sheets };
}

/* =========================
 * Employee Export builders
 * ========================= */

// ===== date/period helpers (for employee export computed columns) =====
function Export_parseDate_(v){
  if (v === null || v === undefined || v === '') return null;

  // Date
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // number (timestamp or sheet serial)
  if (typeof v === 'number' && isFinite(v)) {
    // ms timestamp
    if (v > 1000000000000) {
      var d0 = new Date(v);
      return isNaN(d0.getTime()) ? null : d0;
    }
    // sheet/excel serial (1899-12-30)
    var base = Date.UTC(1899, 11, 30);
    var d1 = new Date(base + Math.round(v * 86400000));
    return isNaN(d1.getTime()) ? null : d1;
  }

  // numeric string
  if (typeof v === 'string') {
    var s = v.trim();
    if (!s) return null;
    if (!isNaN(Number(s))) return Export_parseDate_(Number(s));
    // yyyy-mm-dd (or similar)
    var m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (m) {
      var d2 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isNaN(d2.getTime()) ? null : d2;
    }
  }

  return null;
}

function Export_diffMonths_(d1, d2){
  if (!d1 || !d2) return 0;
  var y1 = d1.getFullYear(), m1 = d1.getMonth(), day1 = d1.getDate();
  var y2 = d2.getFullYear(), m2 = d2.getMonth(), day2 = d2.getDate();
  var months = (y2 - y1) * 12 + (m2 - m1);
  if (day2 < day1) months -= 1;
  return months < 0 ? 0 : months;
}

// ===== inclusive 기간 계산(개월/일) + 표기 규칙 =====
function Export_dateOnlyUtc_(d){
  if (!d) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function Export_addDaysUtc_(d, days){
  var x = Export_dateOnlyUtc_(d);
  if (!x) return null;
  return new Date(x.getTime() + (Number(days || 0) * 86400000));
}

function Export_addMonthsClampedUtc_(d, addMonths){
  var x = Export_dateOnlyUtc_(d);
  if (!x) return null;
  var y = x.getUTCFullYear();
  var m = x.getUTCMonth();
  var day = x.getUTCDate();
  var nm = m + Number(addMonths || 0);
  var ny = y + Math.floor(nm / 12);
  var mm = ((nm % 12) + 12) % 12;
  // 해당 월의 마지막 날짜로 clamp
  var last = new Date(Date.UTC(ny, mm + 1, 0)).getUTCDate();
  var nd = Math.min(day, last);
  return new Date(Date.UTC(ny, mm, nd));
}

// ✅ inclusive: 시작일도 1일로 포함
// 예) 2025-01-01 ~ 2025-12-31 => 12개월 0일
function Export_diffMonthsDaysInclusive_(startD, endD){
  var s = Export_dateOnlyUtc_(startD);
  var e = Export_dateOnlyUtc_(endD);
  if (!s || !e) return { months: 0, days: 0 };
  if (e.getTime() < s.getTime()) return { months: 0, days: 0 };

  // inclusive를 exclusive로 바꿔서 계산: endExcl = end + 1day
  var endExcl = Export_addDaysUtc_(e, 1);

  // 1) 최대 개월수 후보
  var months = (endExcl.getUTCFullYear() - s.getUTCFullYear()) * 12
             + (endExcl.getUTCMonth() - s.getUTCMonth());

  // 2) start + months 가 endExcl을 넘지 않도록 조정
  var anchor = Export_addMonthsClampedUtc_(s, months);
  if (anchor.getTime() > endExcl.getTime()){
    months -= 1;
    anchor = Export_addMonthsClampedUtc_(s, months);
  }
  if (months < 0) months = 0;

  // 3) 남은 일수(exclusive 차이)
  var days = Math.round((endExcl.getTime() - anchor.getTime()) / 86400000);
  if (days < 0) days = 0;

  return { months: months, days: days };
}

// months/days -> '00개월 0일' 기반, 단 0은 숨김, 둘 다 0이면 공백
// - 0개월 0일 => ''
// - 14개월 0일 => '14개월'
// - 0개월 24일 => '24일'
function Export_formatPeriodMd_(md){
  if (!md) return '';
  var months = Number(md.months || 0);
  var days = Number(md.days || 0);
  if (!isFinite(months) || months < 0) months = 0;
  if (!isFinite(days) || days < 0) days = 0;
  if (months === 0 && days === 0) return '';
  var out = '';
  if (months > 0) out += months + '개월';
  if (days > 0) out += (out ? ' ' : '') + days + '일';
  return out;
}

// '14개월 0일' / '14개월' / '24일' / '' -> {months,days} (둘 다 0이면 null)
function Export_parsePeriodTextMd_(v){
  if (v === null || v === undefined) return null;
  var s = String(v || '').trim();
  if (!s) return null;

  var m = 0, d = 0;
  var mm = s.match(/(\d+)\s*개월/);
  var dd = s.match(/(\d+)\s*일/);
  if (mm) m = Number(mm[1] || 0);
  if (dd) d = Number(dd[1] || 0);

  if (!isFinite(m) || m < 0) m = 0;
  if (!isFinite(d) || d < 0) d = 0;
  if (m === 0 && d === 0) return null;
  return { months: m, days: d };
}

// months -> "Y년 M개월" (0이면 빈값)
function Export_formatPeriodYm_(months){
  months = Number(months || 0);
  if (!isFinite(months) || months < 0) return '';
  if (months === 0) return '';
  var y = Math.floor(months / 12);
  var m = months % 12;
  var out = '';
  if (y > 0) out += y + '년';
  if (m > 0) out += (out ? ' ' : '') + m + '개월';
  return out;
}

// months -> "N개월 0일" (0인 경우도 표시하려면 zeroAsLiteral=true)
function Export_formatMonthsMd_(months, zeroAsLiteral){
  months = Number(months || 0);
  if (!isFinite(months) || months < 0) return '';
  if (months === 0) return zeroAsLiteral ? '0개월 0일' : '';
  return String(months) + '개월 0일';
}

// months -> "Y년 M개월 D일" (D는 0일 고정; 0도 표시 가능)
function Export_formatPeriodYmdFromMonths_(months, showZero){
  months = Number(months || 0);
  if (!isFinite(months) || months < 0) return '';
  if (months === 0 && !showZero) return '';
  var y = Math.floor(months / 12);
  var m = months % 12;
  var d = 0;
  var out = '';
  out += y + '년';
  out += ' ' + m + '개월';
  out += ' ' + d + '일';
  return out;
}

function Export_isActiveRange_(startD, endD, today){
  if (!today) today = new Date();
  if (startD && startD > today) return false;
  if (endD && endD < today) return false;
  return true;
}

function Export_pickCurrentRowByDate_(rows, startIdx, endIdx, today){
  today = today || new Date();
  if (!rows || !rows.length) return null;

  var active = [];
  for (var i=0; i<rows.length; i++) {
    var r = rows[i];
    var sd = Export_parseDate_(startIdx >= 0 ? r[startIdx] : '');
    var ed = Export_parseDate_(endIdx >= 0 ? r[endIdx] : '');
    if (Export_isActiveRange_(sd, ed, today)) active.push(r);
  }
  var pickFrom = active.length ? active : rows;

  // latest start_date
  pickFrom.sort(function(a,b){
    var ad = Export_parseDate_(startIdx >= 0 ? a[startIdx] : '');
    var bd = Export_parseDate_(startIdx >= 0 ? b[startIdx] : '');
    var at = ad ? ad.getTime() : 0;
    var bt = bd ? bd.getTime() : 0;
    return bt - at;
  });
  return pickFrom[0] || null;
}

function Export_buildEmployeeComputedMap_(eids){
  var idSet = {};
  (eids || []).forEach(function(id){ idSet[String(id||'').trim()] = true; });

  var today = new Date();

  // read child tables once
  var tPos = Export_readSheetTable_('Employee_Position');
  var tAgr = Export_readSheetTable_('Employee_Agreement');
  var tExp = Export_readSheetTable_('Employee_Experience');

  function groupByEid_(t){
    var eidIdx = Export_indexOf_(t.headers, 'employee_id');
    // ✅ 소프트삭제 컬럼 혼재 대응: is_deleted / is_delete
    var delIdx = Export_indexOf_(t.headers, 'is_deleted');
    if (delIdx < 0) delIdx = Export_indexOf_(t.headers, 'is_delete');
    var g = {};
    t.rows.forEach(function(r){
      var eid = (eidIdx >= 0) ? String(r[eidIdx] || '').trim() : '';
      if (!eid || !idSet[eid]) return;
      if (delIdx >= 0) {
        var dv = String(r[delIdx] || '').trim();
        if (dv === '1' || dv.toLowerCase() === 'true') return;
      }
      if (!g[eid]) g[eid] = [];
      g[eid].push(r);
    });
    return g;
  }

  var posBy = groupByEid_(tPos);
  var agrBy = groupByEid_(tAgr);
  var expBy = groupByEid_(tExp);

  // idx cache
  var posNameIdx = Export_indexOf_(tPos.headers, 'name');
  var posStartIdx = Export_indexOf_(tPos.headers, 'start_date');
  var posEndIdx = Export_indexOf_(tPos.headers, 'end_date');

  var agrStartIdx = Export_indexOf_(tAgr.headers, 'start_date');
  var agrEndIdx = Export_indexOf_(tAgr.headers, 'end_date');

  var expCatIdx = Export_indexOf_(tExp.headers, 'category');
  var expWsIdx = Export_indexOf_(tExp.headers, 'working_start_date');
  var expWeIdx = Export_indexOf_(tExp.headers, 'working_end_date');
  var expPeriodIdx = Export_indexOf_(tExp.headers, 'period');

  var out = {};
  (eids || []).forEach(function(eid){
    eid = String(eid || '').trim();
    if (!eid) return;

    // position (current)
    var posRow = Export_pickCurrentRowByDate_(posBy[eid] || [], posStartIdx, posEndIdx, today);
    var positionName = posRow && posNameIdx >= 0 ? String(posRow[posNameIdx] || '').trim() : '';

    // agreement (current)
    var agrRow = Export_pickCurrentRowByDate_(agrBy[eid] || [], agrStartIdx, agrEndIdx, today);
    var agrS = agrRow ? Export_parseDate_(agrStartIdx >= 0 ? agrRow[agrStartIdx] : '') : null;
    var agrE = agrRow ? Export_parseDate_(agrEndIdx >= 0 ? agrRow[agrEndIdx] : '') : null;
    var agrEndForNow = (agrE && agrE < today) ? agrE : today;
    var agrMd = (agrS ? Export_diffMonthsDaysInclusive_(agrS, agrE || today) : {months:0,days:0});
    var agrNowMd = (agrS ? Export_diffMonthsDaysInclusive_(agrS, agrEndForNow) : {months:0,days:0});
 

    // experience approval period (category includes '적용')
    // ✅ Employee_Experience.period(경력기간) 합산(내부경력(적용)+외부경력(적용))
    //    - period 컬럼이 있으면 우선 파싱해서 사용
    //    - 없거나 비어있으면 working_start/end로 fallback
    var expMd = { months: 0, days: 0 };
    (expBy[eid] || []).forEach(function(r){
      var cat = expCatIdx >= 0 ? String(r[expCatIdx] || '').trim() : '';
      if (cat.indexOf('적용') < 0) return;

      var md = null;

      // prefer: period column text
      if (expPeriodIdx >= 0) {
        md = Export_parsePeriodTextMd_(r[expPeriodIdx]);
      }

      // fallback: working_start_date ~ working_end_date
      if (!md) {
        var ws = Export_parseDate_(expWsIdx >= 0 ? r[expWsIdx] : '');
        var we = Export_parseDate_(expWeIdx >= 0 ? r[expWeIdx] : '');
        if (!ws) return;
        md = Export_diffMonthsDaysInclusive_(ws, we || today);
      }

      expMd.months += (md.months || 0);
      expMd.days += (md.days || 0);
    });

    // days -> months carry (표기용)
    if (expMd.days >= 30){
      var expCarry = Math.floor(expMd.days / 30);
      expMd.months += expCarry;
      expMd.days = expMd.days % 30;
    }

    // total working (tenure + approval experience)
    // ✅ 합산은 구간이 여러 개라 '정확한 달 환산'이 수학적으로 애매해서,
    //    표기는 months/days를 그대로 더한 뒤 days는 30일=1개월로만 carry 처리한다(표기용).
    var totalMd = { months: (agrNowMd.months || 0) + (expMd.months || 0), days: (agrNowMd.days || 0) + (expMd.days || 0) };
    if (totalMd.days >= 30){
      var carry = Math.floor(totalMd.days / 30);
      totalMd.months += carry;
      totalMd.days = totalMd.days % 30;
    }

    var totalForYear = totalMd.months + (totalMd.days > 0 ? 1 : 0); // yearcount 계산 보정(표시용)
    var yearCount = totalForYear > 0 ? (Math.floor((totalForYear - 1) / 12) + 1) : 0; // 1~

    out[eid] = {
      position: positionName,
      agreement_start_date: agrS ? Export_formatYmd_(agrS) : '',
      agreement_end_date: agrE ? Export_formatYmd_(agrE) : '',
      agreement_period: Export_formatPeriodMd_(agrMd),
      agreement_period_now: Export_formatPeriodMd_(agrNowMd),
      experience_approval_period: Export_formatPeriodMd_(expMd),
      working_period: Export_formatPeriodMd_(totalMd),
      working_yearcount: yearCount ? (String(yearCount) + '년차') : ''
    };
  });

  return out;
}

function EmployeeExport_buildPayloadFromFilters_(filters){
  // FilterWrap.getState 구조를 흡수해서 category/status/manage/q를 뽑는다.
  var fs = (filters && filters.selectedByPanel) ? filters
         : (filters && filters.filters && filters.filters.selectedByPanel) ? filters.filters
         : (filters && filters.filters) ? filters.filters
         : filters;

  var byPanel = (fs && fs.selectedByPanel) ? fs.selectedByPanel : {};

  function firstSelected(key){
    for (var p in byPanel){
      if (!byPanel.hasOwnProperty(p)) continue;
      var sel = (byPanel[p] && byPanel[p].selected) ? byPanel[p].selected : {};
      if (sel && sel[key] && sel[key].length) return sel[key][0];
    }
    return '';
  }

  // inputs에서 q 같은 값이 들어오는 경우도 대비
  function pickInput(key){
    for (var p in byPanel){
      if (!byPanel.hasOwnProperty(p)) continue;
      var inp = (byPanel[p] && byPanel[p].inputs) ? byPanel[p].inputs : {};
      if (inp && inp[key] != null && String(inp[key] || '').trim() !== '') return String(inp[key] || '').trim();
    }
    return '';
  }

  return {
    page: 1,
    pageSize: 10000,
    q: pickInput('q') || '',
    category: String(firstSelected('category') || '').trim(),
    status: String(firstSelected('status') || '').trim(),
    manage: String(firstSelected('manage') || '').trim()
  };
}

function EmployeeExport_buildListWorkbook_(req){
  req = req || {};
  var uiEids = Array.isArray(req.eids)
    ? req.eids.map(function(v){ return String(v||'').trim(); }).filter(Boolean)
    : [];
  if (uiEids.length){
    var seenUi = {};
    uiEids = uiEids.filter(function(id){
      if (seenUi[id]) return false;
      seenUi[id] = true;
      return true;
    });
  }

  var filtersActive = Export_hasAnyCriteriaInFilters_(req.filters);
  var eids = [];

  // UI에서 보이는 순서가 전달되면 그 순서를 최우선 사용한다.
  if (uiEids.length){
    eids = uiEids.slice();
  } else if (filtersActive) {
    try {
      if (typeof EMPLOYEE_list === 'function') {
        var payload = EmployeeExport_buildPayloadFromFilters_(req.filters);
        var listRes = EMPLOYEE_list(payload);
        if (listRes && listRes.ok) {
          var arr = listRes.rows || listRes.items || [];
          eids = arr.map(function(it){ return String(it.employee_id || '').trim(); }).filter(Boolean);
        }
      }
    } catch(e){}

    if (!eids.length) eids = ['__NO_MATCH__'];

  } else {
    // 필터가 없으면: 전체 다운로드 정책(삭제 제외)
    try {
      if (typeof EMPLOYEE_list === 'function') {
        var listRes2 = EMPLOYEE_list({ page:1, pageSize: 10000, q:'', category:'', status:'', manage:'' });
        if (listRes2 && listRes2.ok) {
          var arr2 = listRes2.rows || listRes2.items || [];
          eids = arr2.map(function(it){ return String(it.employee_id || '').trim(); }).filter(Boolean);
        }
      }
    } catch(e){}

    if (!eids.length) {
      // fallback: 시트에서 employee_id를 읽되 is_deleted=1은 제외
      var tEmp = Export_readSheetTable_('Employee');
      var idIdx = Export_indexOf_(tEmp.headers, 'employee_id');
      var delIdx = Export_indexOf_(tEmp.headers, 'is_deleted');
      if (idIdx >= 0) {
        tEmp.rows.forEach(function(r){
          if (delIdx >= 0) {
            var dv = String(r[delIdx] || '').trim();
            if (dv === '1' || dv.toLowerCase() === 'true') return;
          }
          var v = String(r[idIdx] || '').trim();
          if (v) eids.push(v);
        });
      }
    }

    if (!eids.length) eids = ['__NO_MATCH__'];
  }

  // order map
  var orderMap = {};
  for (var i=0; i<eids.length; i++) orderMap[eids[i]] = i;
  var uiSheetOrderMap = Export_buildUiSheetOrderMap_(req);

  var empMetaMap = Export_buildEmployeeMetaMap_(eids);
  var empComputedMap = Export_buildEmployeeComputedMap_(eids);

  var sheets = [];
  sheets.push(Export_buildEmployeeSheetUiLike_('기본정보', 'Employee', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('직위', 'Employee_Position', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Position, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Position, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('계약', 'Employee_Agreement', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Agreement, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Agreement, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('경력', 'Employee_Experience', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Experience, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Experience, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('학력', 'Employee_Education', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Education, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Education, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('교육', 'Employee_Training', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Training, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Training, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('자격', 'Employee_Qualification', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Qualification, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Qualification, uiSheetOrderMap));

  return { sheets: sheets };
}

function EmployeeExport_buildDetailWorkbook_(req){
  req = req || {};
  var eid = String(req.id || '').trim();
  if (!eid) {
    return { sheets:[ { name:'오류', values:[ ['message'], ['DETAIL 모드에서는 id(employee_id)가 필요합니다.'] ] } ] };
  }

  var eids = [eid];
  var orderMap = {}; orderMap[eid] = 0;
  var uiSheetOrderMap = Export_buildUiSheetOrderMap_(req);
  var empMetaMap = Export_buildEmployeeMetaMap_(eids);
  var empComputedMap = Export_buildEmployeeComputedMap_(eids);

  var sheets = [];
  sheets.push(Export_buildEmployeeSheetUiLike_('기본정보', 'Employee', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('직위', 'Employee_Position', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Position, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Position, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('계약', 'Employee_Agreement', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Agreement, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Agreement, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('경력', 'Employee_Experience', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Experience, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Experience, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('학력', 'Employee_Education', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Education, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Education, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('교육', 'Employee_Training', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Training, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Training, uiSheetOrderMap));
  sheets.push(Export_buildEmployeeSheetUiLike_('자격', 'Employee_Qualification', eids, orderMap, empMetaMap, empComputedMap, EMPLOYEE_EXPORT_HIDE_FIELDS_.Employee_Qualification, EMPLOYEE_EXPORT_HEADER_LABELS_.Employee_Qualification, uiSheetOrderMap));

  return { sheets: sheets };
}

function Export_buildEmployeeMetaMap_(eids){
  var t = Export_readSheetTable_('Employee');
  var idIdx = Export_indexOf_(t.headers, 'employee_id');
  var nameIdx = Export_indexOf_(t.headers, 'name');
  // ✅ 소프트삭제 컬럼 혼재 대응: is_deleted / is_delete
  var delIdx = Export_indexOf_(t.headers, 'is_deleted');
  if (delIdx < 0) delIdx = Export_indexOf_(t.headers, 'is_delete');

  var idSet = {};
  (eids || []).forEach(function(id){ idSet[String(id||'').trim()] = true; });

  var map = {};
  t.rows.forEach(function(r){
    var eid = (idIdx >= 0) ? String(r[idIdx] || '').trim() : '';
    if (!eid || !idSet[eid]) return;

    // 삭제행은 meta에서도 제외
    if (delIdx >= 0) {
      var dv = String(r[delIdx] || '').trim();
      if (dv === '1' || dv.toLowerCase() === 'true') return;
    }

    map[eid] = {
      employee_id: eid,
      name: (nameIdx >= 0 ? String(r[nameIdx] || '').trim() : '')
    };
  });
  return map;
}

function Export_buildEmployeeSheetUiLike_(sheetTitle, dbSheetName, eids, orderMap, empMetaMap, empComputedMap, hideFields, labelMap, uiSheetOrderMap){
  var t = Export_readSheetTable_(dbSheetName);

  var eidIdx = Export_indexOf_(t.headers, 'employee_id');
  // ✅ 소프트삭제 컬럼 혼재 대응: is_deleted / is_delete
  var delIdx = Export_indexOf_(t.headers, 'is_deleted');
  if (delIdx < 0) delIdx = Export_indexOf_(t.headers, 'is_delete');

  var rows = t.rows;

  // employee_id로 필터 + 목록 순서로 정렬
  if (eidIdx >= 0 && eids && eids.length) {
    var idSet = {};
    eids.forEach(function(id){ idSet[String(id || '').trim()] = true; });

    rows = rows.filter(function(r){
      var eid = String(r[eidIdx] || '').trim();
      if (!eid || !idSet[eid]) return false;

      // 자식 시트 삭제행 제외
      if (delIdx >= 0) {
        var dv = String(r[delIdx] || '').trim();
        if (dv === '1' || dv.toLowerCase() === 'true') return false;
      }
      return true;
    });

    var pkField = Export_pkFieldBySheet_(dbSheetName);
    var pkIdx = pkField ? Export_indexOf_(t.headers, pkField) : -1;
    var rowOrder = (uiSheetOrderMap && uiSheetOrderMap[dbSheetName]) ? uiSheetOrderMap[dbSheetName] : null;
    var sortDateFields = Export_employeeSortDateFieldsBySheet_(dbSheetName);

    rows.sort(function(a,b){
      var ea = String(a[eidIdx] || '').trim();
      var eb = String(b[eidIdx] || '').trim();
      var p = (orderMap[ea] || 0) - (orderMap[eb] || 0);
      if (p) return p;
      if (rowOrder && pkIdx >= 0){
        var ka = String(a[pkIdx] || '').trim();
        var kb = String(b[pkIdx] || '').trim();
        var ia = Object.prototype.hasOwnProperty.call(rowOrder, ka) ? rowOrder[ka] : 9999999;
        var ib = Object.prototype.hasOwnProperty.call(rowOrder, kb) ? rowOrder[kb] : 9999999;
        if (ia !== ib) return ia - ib;
      }
      if (sortDateFields && sortDateFields.length){
        var va = '';
        var vb = '';
        for (var i=0; i<sortDateFields.length; i++){
          var idx = Export_indexOf_(t.headers, sortDateFields[i]);
          if (idx < 0) continue;
          if (!va) va = a[idx];
          if (!vb) vb = b[idx];
          if (va && vb) break;
        }
        var ta = Export_toYmdTs_(va);
        var tb = Export_toYmdTs_(vb);
        if (ta !== tb) return ta - tb;
      }
      if (pkIdx >= 0){
        var pa = String(a[pkIdx] || '').trim();
        var pb = String(b[pkIdx] || '').trim();
        if (pa !== pb) return pa.localeCompare(pb);
      }
      return 0;
    });
  }

  // hide set
  var hide = {};
  (hideFields || []).forEach(function(k){ hide[String(k||'').toLowerCase()] = true; });

  // ✅ employee export에서는 desc 컬럼 제외
  hide['desc'] = true;

  // 사번/성명은 항상 A/B로 강제이므로 본문(C~)에서는 중복 제거
  hide['employee_id'] = true;
  // ■ Employee 시트의 name(성명)만 B열에서 강제 출력하므로 본문에서는 제거
  //   그 외 시트의 name(직위명/교육명/자격명 등)은 필요하므로 숨기지 않음
  if (dbSheetName === 'Employee') {
    hide['name'] = true;
  }

  var outKeys = [];

  // ✅ 1) 시트별 고정 순서가 있으면 그 순서를 사용
  var order = (typeof EMPLOYEE_EXPORT_COLUMN_ORDER_ !== 'undefined' && EMPLOYEE_EXPORT_COLUMN_ORDER_ && EMPLOYEE_EXPORT_COLUMN_ORDER_[dbSheetName])
    ? EMPLOYEE_EXPORT_COLUMN_ORDER_[dbSheetName]
    : null;

  if (order && order.length) {
    for (var oi=0; oi<order.length; oi++){
      var ok = String(order[oi] || '').trim();
      if (!ok) continue;
      if (ok === 'employee_id') continue; // A 고정
      if (ok === 'name' && dbSheetName === 'Employee') continue; // Employee는 B(성명) 중복 제거
      if (hide[ok.toLowerCase()]) continue;
      outKeys.push(ok);
    }
  } else {
    for (var i=0; i<t.headers.length; i++){
      var key = String(t.headers[i] || '').trim();
      if (!key) continue;
      if (hide[key.toLowerCase()]) continue;
      outKeys.push(key);
    }
  }

  // ✅ labelMap에만 존재하는 필드의 자동 주입은
  //    "시트별 고정 순서(order)를 쓰지 않을 때만" 하도록 한정
  //    (order를 사용하면, DB에 없는 필드도 order에 만 넣으면 엑셀 열이 생성되므로 중복/추가 열 생성을 방지)
  if (!order && labelMap) {
    for (var k in labelMap) {
      if (!labelMap.hasOwnProperty(k)) continue;
      var lk = String(k || '').trim();
      if (!lk) continue;
      if (hide[lk.toLowerCase()]) continue;
      if (Export_indexOf_(t.headers, lk) >= 0) continue; // DB에 이미 있으면 스킵
      // employee_id/name은 A/B로 고정
      if (lk === 'employee_id') continue;
      if (lk === 'name' && dbSheetName === 'Employee') continue;
      outKeys.push(lk);
    }
  }

  var outHeader = ['사번', '성명'].concat(
    outKeys.map(function(k){
      if (labelMap && labelMap[k]) return labelMap[k];
      return Export_labelizeKey_(k);
    })
  );

  var idxs = outKeys.map(function(k){ return Export_indexOf_(t.headers, k); });

  var outRows = rows.map(function(r){
    var eid = (eidIdx >= 0) ? String(r[eidIdx] || '').trim() : '';
    var meta = (empMetaMap && eid && empMetaMap[eid]) ? empMetaMap[eid] : { employee_id: eid, name: '' };
    var comp = (empComputedMap && eid && empComputedMap[eid]) ? empComputedMap[eid] : {};

    var rowOut = [ meta.employee_id || eid, meta.name || '' ];

    for (var j=0; j<idxs.length; j++){
      var idx = idxs[j];
      var key = outKeys[j];
      var v = (idx >= 0 ? r[idx] : '');

      // DB에 값이 없거나(또는 컬럼 자체가 없거나) 프론트 계산값이면 여기서 주입
      if (idx < 0 || v === '' || v === null || v === undefined) {
        // Employee sheet computed
        if (dbSheetName === 'Employee' && comp && comp.hasOwnProperty(key)) {
          v = comp[key];
        }

        // child sheet per-row computed
        if (key === 'period') {
          if (dbSheetName === 'Employee_Position' || dbSheetName === 'Employee_Agreement') {
            var sIdx = Export_indexOf_(t.headers, 'start_date');
            var eIdx = Export_indexOf_(t.headers, 'end_date');
            var sd = Export_parseDate_(sIdx >= 0 ? r[sIdx] : '');
            var ed = Export_parseDate_(eIdx >= 0 ? r[eIdx] : '') || new Date();
            v = Export_formatPeriodMd_(Export_diffMonthsDaysInclusive_(sd, ed));
          } else if (dbSheetName === 'Employee_Experience') {
            // experience period: working_start_date ~ working_end_date
            var wsIdx = Export_indexOf_(t.headers, 'working_start_date');
            var weIdx = Export_indexOf_(t.headers, 'working_end_date');
            var wsd = Export_parseDate_(wsIdx >= 0 ? r[wsIdx] : '');
            var wed = Export_parseDate_(weIdx >= 0 ? r[weIdx] : '') || new Date();
            v = Export_formatPeriodMd_(Export_diffMonthsDaysInclusive_(wsd, wed));
          }
        }

        if (dbSheetName === 'Employee_Experience' && key === 'working_period') {
          var wsIdx2 = Export_indexOf_(t.headers, 'working_start_date');
          var weIdx2 = Export_indexOf_(t.headers, 'working_end_date');
          var wsd2 = Export_parseDate_(wsIdx2 >= 0 ? r[wsIdx2] : '');
          var wed2 = Export_parseDate_(weIdx2 >= 0 ? r[weIdx2] : '') || new Date();
          v = Export_formatPeriodMd_(Export_diffMonthsDaysInclusive_(wsd2, wed2));
        }
      }

      if (/_date$/i.test(key)) {
        v = Export_formatYmd_(v);
      }
      // ✅ 프론트 계산값에서 0이면 '-'로 들어오는 케이스: 엑셀은 공백 처리
      if (v === '-') v = '';
      rowOut.push(v);
    }
    return rowOut;
  });

  return { name: sheetTitle, values: [outHeader].concat(outRows) };
}

/**
 * ✅ 참여인력 합치기: Project_Member_Ex + Project_Member_In
 * - 첫 컬럼에 member_scope(외부/내부) 추가
 */
function ProjectExport_buildMembersSheet_(pids, orderMap){
  var ex = Export_readSheetTable_('Project_Member_Ex');
  var inn = Export_readSheetTable_('Project_Member_In');

  var exPidIdx = Export_indexOf_(ex.headers, 'project_id');
  var inPidIdx = Export_indexOf_(inn.headers, 'project_id');

  // 공통 출력 헤더(가독성 + 내부/외부 통합)
  var outHeader = [
    'member_scope',
    'project_id',
    'agency_category',
    'employee_id',
    'name',
    'company',
    'department',
    'position',
    'company_number',
    'phone_number',
    'email',
    'start_date',
    'end_date',
    'status',
    'role'
  ];

  function pickRowObj(headers, row){
    var o = {};
    for (var i=0; i<headers.length; i++){
      var k = String(headers[i] || '').trim();
      if (!k) continue;
      o[k] = row[i];
    }
    return o;
  }

  var outRows = [];

  // 외부
  ex.rows.forEach(function(r){
    var pid = (exPidIdx >= 0) ? String(r[exPidIdx] || '').trim() : '';
    if (!pid || !orderMap.hasOwnProperty(pid)) return;
    var o = pickRowObj(ex.headers, r);

    outRows.push(outHeader.map(function(h){
      if (h === 'member_scope') return '외부';
      return (o.hasOwnProperty(h) ? o[h] : '');
    }));
  });

  // 내부
  inn.rows.forEach(function(r){
    var pid = (inPidIdx >= 0) ? String(r[inPidIdx] || '').trim() : '';
    if (!pid || !orderMap.hasOwnProperty(pid)) return;
    var o = pickRowObj(inn.headers, r);

    outRows.push(outHeader.map(function(h){
      if (h === 'member_scope') return '내부';
      return (o.hasOwnProperty(h) ? o[h] : '');
    }));
  });

  // 정렬: project_id 기준 목록순
  var pidOutIdx = Export_indexOf_(outHeader, 'project_id');
  outRows.sort(function(a,b){
    var pa = String(a[pidOutIdx] || '').trim();
    var pb = String(b[pidOutIdx] || '').trim();
    return (orderMap[pa] || 0) - (orderMap[pb] || 0);
  });

  return { name:'참여인력', values: [outHeader].concat(outRows) };
}

/* =========================
 * Payroll Export builders
 * ========================= */

function PayrollExport_periodKr_(p){
  p = String(p || '').trim();
  var m = p.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return p;
  var y = m[1];
  var mm = String(Number(m[2]) || 0).padStart(2,'0');
  return y + '년 ' + mm + '월';
}

// ✅ 총근무연차 표기: 숫자만 오면 "N년차", 빈값/0이면 "0년차"
function PayrollExport_yearcountLabel_(v){
  if (v == null) return '0년차';
  var s = String(v).trim();
  if (!s) return '0년차';
  // 이미 "년차" 포함이면 그대로
  if (s.indexOf('년차') >= 0) return s;
  // 숫자만(또는 숫자+공백)인 경우 "N년차"
  var n = parseInt(s.replace(/[^0-9]/g,''), 10);
  if (!isFinite(n)) return s;
  return String(n) + '년차';
}

function PayrollExport_parseFilters_(filters){
  // FilterWrap.getState(wrap) 또는 {selectedByPanel} 또는 {filters:{selectedByPanel}} 모두 흡수
  var fs = (filters && filters.selectedByPanel) ? filters
         : (filters && filters.filters && filters.filters.selectedByPanel) ? filters.filters
         : (filters && filters.filters) ? filters.filters
         : filters;

  var byPanel = (fs && fs.selectedByPanel) ? fs.selectedByPanel : {};

  function mergeSelected(key){
    var out = [];
    var seen = {};
    for (var p in byPanel){
      if (!byPanel.hasOwnProperty(p)) continue;
      var sel = (byPanel[p] && byPanel[p].selected) ? byPanel[p].selected : {};
      var arr = sel ? sel[key] : null;
      if (!Array.isArray(arr)) continue;
      arr.forEach(function(v){
        v = String(v == null ? '' : v).trim();
        if (!v) return;
        if (seen[v]) return;
        seen[v] = true;
        out.push(v);
      });
    }
    return out;
  }

  function pickInput(key){
    for (var p in byPanel){
      if (!byPanel.hasOwnProperty(p)) continue;
      var inp = (byPanel[p] && byPanel[p].inputs) ? byPanel[p].inputs : {};
      if (inp && inp[key] != null && String(inp[key] || '').trim() !== '') return String(inp[key] || '').trim();
    }
    return '';
  }

  return {
    staff: mergeSelected('staff'),
    status_now: mergeSelected('status_now'),
    status_working: mergeSelected('status_working'),
    position: mergeSelected('position'),
    expertise: mergeSelected('expertise'),
    working_yearcount: mergeSelected('working_yearcount'),
    q: pickInput('q') || ''
  };
}

function PayrollExport_matchWorkingYearcount_(rowYearcount, selected){
  rowYearcount = String(rowYearcount || '').trim();
  if (!rowYearcount) return false;

  // row: "3년차", "11년차이상" 같은 형태가 올 수 있음
  function parseYc(s){
    s = String(s || '').trim();
    if (!s) return { n: 0, ge: false };
    var ge = (s.indexOf('이상') >= 0);
    var n = Number((s.match(/(\d+)/) || [])[1] || 0) || 0;
    return { n: n, ge: ge };
  }

  var row = parseYc(rowYearcount);
  var sel = parseYc(selected);

  if (!sel.n) return false;

  // 선택값이 "11년차이상"이면: row.n >= 11 이면 true (row가 이상/아님 상관없음)
  if (sel.ge) return row.n >= sel.n;

  // 선택값이 "3년차" 같은 정확 값이면: row.n이 같으면 true
  return row.n === sel.n;
}

function PayrollExport_applyFilters_(rows, filters, uiEids){
  rows = Array.isArray(rows) ? rows : [];
  uiEids = Array.isArray(uiEids) ? uiEids : [];

  var active = Export_hasAnyCriteriaInFilters_(filters);
  if (!active) return rows;

  var f = PayrollExport_parseFilters_(filters);

  // staff chip은 "00000 가나다" 라벨로 들어오므로 employee_id만 뽑아낸다.
  var staffIds = [];
  if (f.staff && f.staff.length){
    f.staff.forEach(function(v){
      var s = String(v || '').trim();
      var m = s.match(/^(\d{4,})/);
      if (m) staffIds.push(m[1]);
      else staffIds.push(s);
    });
    // unique
    var seen = {}; staffIds = staffIds.filter(function(id){ if (!id) return false; if (seen[id]) return false; seen[id]=true; return true; });
  }

  function inList(v, arr){
    if (!arr || !arr.length) return true; // 필터가 없으면 통과
    v = String(v || '').trim();
    for (var i=0; i<arr.length; i++){
      if (v === String(arr[i] || '').trim()) return true;
    }
    return false;
  }

  function textIncludes(row, q){
    q = String(q || '').trim().toLowerCase();
    if (!q) return true;
    var eid = String(row.employee_id || '').trim().toLowerCase();
    var name = String(row.name || '').trim().toLowerCase();
    return (eid.indexOf(q) >= 0) || (name.indexOf(q) >= 0);
  }

  var filtered = rows.filter(function(r){
    if (!r) return false;

    if (staffIds.length && staffIds.indexOf(String(r.employee_id || '').trim()) < 0) return false;
    if (!inList(r.status_now, f.status_now)) return false;
    if (!inList(r.status_working, f.status_working)) return false;
    if (!inList(r.position, f.position)) return false;
    if (!inList(r.expertise, f.expertise)) return false;

    // working_yearcount는 "11년차이상" 같은 범위가 있어서 별도 처리
    if (f.working_yearcount && f.working_yearcount.length){
      var okYc = false;
      for (var i=0; i<f.working_yearcount.length; i++){
        if (PayrollExport_matchWorkingYearcount_(r.working_yearcount, f.working_yearcount[i])) { okYc = true; break; }
      }
      if (!okYc) return false;
    }

    if (!textIncludes(r, f.q)) return false;

    return true;
  });

  // ✅ 서버 필터 결과가 비었는데 화면에는 목록이 있다면: 화면 목록으로 fallback
  if (!filtered.length && uiEids.length){
    var set = {};
    uiEids.forEach(function(id){ set[String(id||'').trim()] = true; });
    filtered = rows.filter(function(r){
      var eid = String(r && r.employee_id || '').trim();
      return !!(eid && set[eid]);
    });
  }

  return filtered;
}

function PayrollExport_buildAttendanceSheet_(rows){
  var headers = [
    '근태기간','사번','성명','고용상태(현재)','고용상태(근무시점)','계약시작일','계약종료일',
    '근무일수','총근무연수','총근무연차','직위','직위유지기간','직무전문성'
  ];

  var values = [headers];
  rows.forEach(function(r){
    values.push([
      PayrollExport_periodKr_(r.payroll_period),
      r.employee_id || '',
      r.name || '',
      r.status_now || '',
      r.status_working || '',
      r.contract_start || '',
      r.contract_end || '',
      r.working_days,
      r.total_working_tenure || '',
      PayrollExport_yearcountLabel_(r.working_yearcount),
      r.position || '',
      r.position_keep || '',
     r.expertise || ''
    ]);
  });

  // ✅ 시트명 변경
  return { name:'근태', values: values };
}

function PayrollExport_blankAsZero_(v){
  // NBSP 공백(\u00A0) 이면 0, 그 외 숫자면 숫자
  if (v === '\u00A0') return 0;
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function PayrollExport_buildBudgetSheet_(rows){
  var headers = [
    '급여기간(예정산출)','사번','성명','고용상태(현재)','기준연봉',
    '기본급','직위수당','자격수당','고정급 합계','초과근무수당','월급여 합계',
    '국민연금','건강보험','고용보험','산재보험','4대 합계',
    '월급여+4대','퇴직금','총인건비(월급여+4대+퇴직금)'
  ];

  var values = [headers];
  rows.forEach(function(r){
    var monthPay = r.month_pay_sum;
    var insTotal = r.ins_total;

    var bothBlank = (monthPay === '\u00A0' && insTotal === '\u00A0');
    var monthPlusIns = bothBlank ? '\u00A0' : (PayrollExport_blankAsZero_(monthPay) + PayrollExport_blankAsZero_(insTotal));

    values.push([
      PayrollExport_periodKr_(r.payroll_period),
      r.employee_id || '',
      r.name || '',
      r.status_now || '',
      r.base_year,
      r.base_month,
      r.alw_position,
      r.alw_expertise,
      r.fixed_sum,
      r.alw_overtime,
      r.month_pay_sum,
      r.ins_np,
      r.ins_hi,
      r.ins_ei,
      r.ins_ii,
      r.ins_total,
      monthPlusIns,
      r.severance,
      r.labor_total
    ]);
  });

  // ✅ 시트명 변경
  return { name:'급여(예정산출)', values: values };
}

function PayrollExport_buildActualSheet_(rows){
  var headers = [
    '급여기간(지급완료)','사번','성명','고용상태(현재)',
    '고정급','초과근무수당','월급여 합계',
    '국민연금','건강보험','고용보험','산재보험','4대 합계',
    '월급여+4대','퇴직금','총인건비(월급여+4대+퇴직금)'
  ];

  var values = [headers];
  rows.forEach(function(r){
    var monthPay = r.month_pay_sum;
    var insTotal = r.ins_total;

    var bothBlank = (monthPay === '\u00A0' && insTotal === '\u00A0');
    var monthPlusIns = bothBlank ? '\u00A0' : (PayrollExport_blankAsZero_(monthPay) + PayrollExport_blankAsZero_(insTotal));

    values.push([
      PayrollExport_periodKr_(r.payroll_period),
      r.employee_id || '',
      r.name || '',
      r.status_now || '',
      r.fixed_sum,
      r.alw_overtime,
      r.month_pay_sum,
      r.ins_np,
      r.ins_hi,
      r.ins_ei,
      r.ins_ii,
      r.ins_total,
      monthPlusIns,
      r.severance,
      r.labor_total
    ]);
  });

  // ✅ 시트명 변경
  return { name:'급여(지급완료)', values: values };
}

function PayrollExport_buildListWorkbook_(req){
  req = req || {};
  var opt = req.options || {};
  var keys = Array.isArray(opt.sheetKeys) ? opt.sheetKeys : [];
  if (!keys.length) keys = ['attendance','budget','actual'];

  var uiEids = Array.isArray(req.eids)
    ? req.eids.map(function(v){ return String(v||'').trim(); }).filter(Boolean)
    : [];

  // ✅ 기간(필수)
  var fy = Number(req.from_year || 0) || 0;
  var fm = Number(req.from_month || 0) || 0;
  var ty = Number(req.to_year || fy) || fy;
  var tm = Number(req.to_month || fm) || fm;

  if (!fy || !fm || fm < 1 || fm > 12) throw new Error('Invalid from year/month');
  if (!ty || !tm || tm < 1 || tm > 12) throw new Error('Invalid to year/month');
  if ((fy * 100 + fm) > (ty * 100 + tm)) throw new Error('Invalid range: from > to');

  if (typeof PAYROLL_computeRange !== 'function') throw new Error('PAYROLL_computeRange 함수가 없습니다.');

  // 서버에서 기간 범위 계산(월별 계산 결과 합산)
  var res = PAYROLL_computeRange({ from_year: fy, from_month: fm, to_year: ty, to_month: tm });
  var attendance = PayrollExport_applyFilters_(res.attendance || [], req.filters, uiEids);
  var budget     = PayrollExport_applyFilters_(res.budget || [], req.filters, uiEids);
  var actual     = PayrollExport_applyFilters_(res.actual || [], req.filters, uiEids);

  var sheets = [];
  if (keys.indexOf('attendance') >= 0) sheets.push(PayrollExport_buildAttendanceSheet_(attendance));
  if (keys.indexOf('budget') >= 0) sheets.push(PayrollExport_buildBudgetSheet_(budget));
  if (keys.indexOf('actual') >= 0) sheets.push(PayrollExport_buildActualSheet_(actual));

  if (!sheets.length) {
    sheets.push({ name:'오류', values:[ ['message'], ['다운로드할 시트가 없습니다(sheetKeys 비어있음).'] ] });
  }

  return { sheets: sheets };
}


/* =========================
 * Generic helpers
 * ========================= */

function Export_buildSheetFromTable_(sheetTitle, dbSheetName, pids, orderMap){
  var t = Export_readSheetTable_(dbSheetName);

  // project_id 컬럼 없으면 전체 출력(특수케이스 대비)
  var pidIdx = Export_indexOf_(t.headers, 'project_id');
  var rows = t.rows;

  if (pidIdx >= 0 && pids && pids.length) {
    var pidSet = {};
    pids.forEach(function(id){ pidSet[String(id || '').trim()] = true; });

    rows = rows.filter(function(r){
      var pid = String(r[pidIdx] || '').trim();
      return !!pidSet[pid];
    });

    // 정렬(프로젝트 목록 순서 우선)
    rows.sort(function(a,b){
      var pa = String(a[pidIdx] || '').trim();
      var pb = String(b[pidIdx] || '').trim();
      return (orderMap[pa] || 0) - (orderMap[pb] || 0);
    });
  }

  return { name: sheetTitle, values: [t.headers].concat(rows) };
}

function Export_readSheetTable_(sheetName){
  var sh = DB_sheet_(sheetName); // dbCore.js 사용
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return { headers: [], rows: [] };
  }
  var data = sh.getRange(1, 1, lastRow, lastCol).getValues();

  var headerRaw = data[0] || [];
  var headers = Export_trimRightEmpty_(headerRaw.map(function(h){ return String(h || '').trim(); }));
  var width = headers.length;

  var rows = [];
  for (var r=1; r<data.length; r++){
    var row = data[r] || [];
    // 폭 맞추기
    var sliced = row.slice(0, width);

    // 완전 빈 행 스킵
    var empty = true;
    for (var c=0; c<width; c++){
      if (String(sliced[c] || '').trim() !== '') { empty = false; break; }
    }
    if (empty) continue;

    rows.push(sliced);
  }

  return { headers: headers, rows: rows };
}

function Export_trimRightEmpty_(arr){
  var end = arr.length;
  while (end > 0) {
    var v = arr[end - 1];
    if (v != null && String(v).trim() !== '') break;
    end--;
  }
  return arr.slice(0, end);
}

function Export_indexOf_(headers, key){
  key = String(key || '').trim().toLowerCase();
  for (var i=0; i<headers.length; i++){
    if (String(headers[i] || '').trim().toLowerCase() === key) return i;
  }
  return -1;
}

function Export_hasAnyCriteriaInFilters_(filters){
  if (!filters) return false;

  // FilterWrap.getState(wrap) 또는 {selectedByPanel} 또는 {filters:{selectedByPanel}} 모두 흡수
  var fs = (filters && filters.selectedByPanel) ? filters
         : (filters && filters.filters && filters.filters.selectedByPanel) ? filters.filters
         : (filters && filters.filters) ? filters.filters
         : filters;

  var byPanel = fs.selectedByPanel || {};
  for (var k in byPanel){
    if (!byPanel.hasOwnProperty(k)) continue;
    var p = byPanel[k] || {};
    var sel = p.selected || {};
    var inp = p.inputs || {};

    for (var s in sel){
      if (!sel.hasOwnProperty(s)) continue;
      var arr = sel[s];
      if (Array.isArray(arr) && arr.length) return true;
    }
    for (var i in inp){
      if (!inp.hasOwnProperty(i)) continue;
      if (String(inp[i] || '').trim() !== '') return true;
    }
  }
  return false;
}


function Export_buildProjectMetaMap_(pids){
  var t = Export_readSheetTable_('Project');
  var pidIdx = Export_indexOf_(t.headers, 'project_id');
  var yearIdx = Export_indexOf_(t.headers, 'year');
  var nameIdx = Export_indexOf_(t.headers, 'business_name');

  var pidSet = {};
  (pids || []).forEach(function(id){ pidSet[String(id||'').trim()] = true; });

  var map = {}; // pid -> {year, business_name}
  t.rows.forEach(function(r){
    var pid = (pidIdx >= 0) ? String(r[pidIdx] || '').trim() : '';
    if (!pid || !pidSet[pid]) return;
    map[pid] = {
      year: yearIdx >= 0 ? r[yearIdx] : '',
      business_name: nameIdx >= 0 ? r[nameIdx] : ''
    };
  });
  return map;
}

function Export_labelizeKey_(key){
  key = String(key || '').trim();
  if (!key) return '';
  // snake_case -> 공백
  return key.replace(/_/g, ' ');
}

function Export_formatYmd_(v){
  if (v === null || v === undefined || v === '') return '';

  var tz = Session.getScriptTimeZone() || 'Asia/Seoul';

  // Date 객체면 그대로 포맷
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }

  // 숫자(시트 시리얼/타임스탬프) 처리
  var n = null;
  if (typeof v === 'number' && isFinite(v)) n = v;
  else if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) n = Number(v);

  if (n !== null){
    // ms 타임스탬프처럼 큰 값이면
    if (n > 1000000000000) {
      var d0 = new Date(n);
      if (!isNaN(d0.getTime())) return Utilities.formatDate(d0, tz, 'yyyy-MM-dd');
    }

    // 시트/엑셀 날짜 시리얼(대략 3만~6만대) → 1899-12-30 기준
    var base = Date.UTC(1899, 11, 30);
    var d1 = new Date(base + Math.round(n * 86400000));
    if (!isNaN(d1.getTime())) return Utilities.formatDate(d1, tz, 'yyyy-MM-dd');
  }

  // 이미 문자열 날짜면 최대한 정규화
  var s = String(v).trim();
  var m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m){
    var d2 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d2.getTime())) return Utilities.formatDate(d2, tz, 'yyyy-MM-dd');
  }

  return s;
}


/**
 * ✅ UI표현 규칙 기반 엑셀 시트 생성
 * - A: year, B: business_name
 * - C~: 해당 테이블 헤더 순서대로, hideFields + year/business_name + 빈헤더 제외
 */
function Export_buildSheetUiLike_(sheetTitle, dbSheetName, pids, orderMap, projectMetaMap, hideFields, labelMap, uiSheetOrderMap){
  var t = Export_readSheetTable_(dbSheetName);

  var pidIdx = Export_indexOf_(t.headers, 'project_id');
  // ✅ 소프트삭제 행 제외 (is_deleted / is_delete = 1)
  var delIdx = Export_indexOf_(t.headers, 'is_deleted');
  if (delIdx < 0) delIdx = Export_indexOf_(t.headers, 'is_delete');
  var rows = t.rows;

  // project_id로 필터 + 프로젝트 목록 순서로 정렬
  if (pidIdx >= 0 && pids && pids.length) {
    var pidSet = {};
    pids.forEach(function(id){ pidSet[String(id || '').trim()] = true; });

    rows = rows.filter(function(r){
      var pid = String(r[pidIdx] || '').trim();
      if (!pidSet[pid]) return false;
      // is_deleted / is_delete 컬럼이 있으면 1인 행 제외
      if (delIdx >= 0){
        var dv = String(r[delIdx] == null ? '' : r[delIdx]).trim();
        if (dv === '1') return false;
      }
      return true;
    });

    var pkField = Export_pkFieldBySheet_(dbSheetName);
    var pkIdx = pkField ? Export_indexOf_(t.headers, pkField) : -1;
    var rowOrder = (uiSheetOrderMap && uiSheetOrderMap[dbSheetName]) ? uiSheetOrderMap[dbSheetName] : null;

    rows.sort(function(a,b){
      var pa = String(a[pidIdx] || '').trim();
      var pb = String(b[pidIdx] || '').trim();
      var p = (orderMap[pa] || 0) - (orderMap[pb] || 0);
      if (p) return p;
      if (rowOrder && pkIdx >= 0){
        var ka = String(a[pkIdx] || '').trim();
        var kb = String(b[pkIdx] || '').trim();
        var ia = Object.prototype.hasOwnProperty.call(rowOrder, ka) ? rowOrder[ka] : 9999999;
        var ib = Object.prototype.hasOwnProperty.call(rowOrder, kb) ? rowOrder[kb] : 9999999;
        if (ia !== ib) return ia - ib;
      }
      return 0;
    });
  }

  // hide set
  var hide = {};
  (hideFields || []).forEach(function(k){ hide[String(k||'').toLowerCase()] = true; });

  // year/name은 항상 A/B로 강제이므로 본문(C~)에서는 중복 제거
  hide['year'] = true;
  hide['business_name'] = true;

  // C~ 컬럼 구성(원래 헤더 순서 유지)
  var outKeys = [];
  for (var i=0; i<t.headers.length; i++){
    var key = String(t.headers[i] || '').trim();
    if (!key) continue;
    if (hide[key.toLowerCase()]) continue;
    outKeys.push(key);
  }

  // 헤더: A,B 고정 + C~
  var outHeader = ['연도', '사업명'].concat(
    outKeys.map(function(k){
      if (labelMap && labelMap[k]) return labelMap[k];
      return Export_labelizeKey_(k); // 매핑 없으면 기본 변환
    })
  );

  // 인덱스 캐시
  var idxs = outKeys.map(function(k){ return Export_indexOf_(t.headers, k); });

  var outRows = rows.map(function(r){
    var pid = (pidIdx >= 0) ? String(r[pidIdx] || '').trim() : '';
    var meta = (projectMetaMap && pid && projectMetaMap[pid]) ? projectMetaMap[pid] : { year:'', business_name:'' };

    var rowOut = [ meta.year, meta.business_name ];
    for (var j=0; j<idxs.length; j++){
      var idx = idxs[j];
      var key = outKeys[j];
      var v = (idx >= 0 ? r[idx] : '');

      // ✅ *_date 컬럼은 yyyy-MM-dd 문자열로 강제
      if (/_date$/i.test(key)) {
        v = Export_formatYmd_(v);
      }

      rowOut.push(v);
    }
    return rowOut;
  });

  return { name: sheetTitle, values: [outHeader].concat(outRows) };
}
