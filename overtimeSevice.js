/**
 * OVERTIME_getContext(payload)
 * payload: { year:"2026년", month:"1" }  // month는 select value (1~12)
 * return: { years:[], employees:[], salaryMap:{}, capAmount:number }
 */
function OVERTIME_getContext(payload){
  var __perf = (typeof DB_perfStart_ === 'function')
    ? DB_perfStart_('OVERTIME_getContext')
    : null;
  var __perfMeta = { ok:false, years:0, employees:0, salaryKeys:0 };
  payload = payload || {};
  var yearSel  = String(payload.year || '').trim();
  var monthSel = String(payload.month || '').trim(); // "1".."12"

  // ---- helpers ----
  function _normYear(v){
    var m = String(v||'').match(/(\d{4})/);
    return m ? m[1] : '';
  }
  function _normMonth(v){
    var m = String(v||'').match(/(\d{1,2})/);
    return m ? String(Number(m[1])) : '';
  }
  function _toNum(v){
    v = String(v==null?'':v).replace(/[^\d.-]/g,'');
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function _sheetValues_(sh){
    if (!sh) return [];
    var lr = sh.getLastRow();
    var lc = sh.getLastColumn();
    if (lr < 1 || lc < 1) return [];
    return sh.getRange(1, 1, lr, lc).getValues();
  }

  // ---- read Basesalary_Std years (중복 제거) ----
  var years = [];
  try{
    var shBase = DB_sheet_('Basesalary_Std');
    var values = _sheetValues_(shBase);
    var header = values.shift() || [];
    var hm = DB_headerMap_(header);
    var yi = hm['year'];
    var set = {};
    values.forEach(function(r){
      var y = String(r[yi]||'').trim();
      if (!y) return;
      set[y] = true;
    });
    years = Object.keys(set).sort(); // "2024년"..."2026년"
  }catch(err){
    // 시트가 없거나 컬럼명 다르면 여기서 터짐 -> 콘솔 확인
    console.error(err);
  }

  // ---- Employee: category=직원, manage=창업지원단 ----
  var employees = [];
  try{
    var shEmp = DB_sheet_('Employee');
    var v2 = _sheetValues_(shEmp);
    var h2 = v2.shift() || [];
    var hm2 = DB_headerMap_(h2);
    var idI = hm2['employee_id'];
    var nameI = hm2['name'];
    var catI = hm2['category'];
    var manI = hm2['manage'];

    v2.forEach(function(r){
      if (String(r[catI]||'').trim() !== '직원') return;
      if (String(r[manI]||'').trim() !== '창업지원단') return;
      var id = String(r[idI]||'').trim();
      var nm = String(r[nameI]||'').trim();
      if (!id || !nm) return;
      employees.push({ employee_id:id, name:nm });
    });
  }catch(err){
    console.error(err);
  }

  // ---- Payment salaryMap (해당 월 실지급액) ----
  var salaryMap = {};
  try{
    var shPay = DB_sheet_('Payment');
    var v3 = _sheetValues_(shPay);
    var h3 = v3.shift() || [];
    var hm3 = DB_headerMap_(h3);

    var yI = hm3['year'];
    var mI = hm3['month'];
    var idI3 = hm3['employee_id'];
    var salI = hm3['salary'];

    var yKey = _normYear(yearSel);
    var mKey = _normMonth(monthSel);

    v3.forEach(function(r){
      if (_normYear(r[yI]) !== yKey) return;
      if (_normMonth(r[mI]) !== mKey) return;
      var id = String(r[idI3]||'').trim();
      if (!id) return;
      salaryMap[id] = _toNum(r[salI]);
    });
  }catch(err){
    console.error(err);
  }

  // ---- Alw_Std capAmount (초과근무수당 / 상한액) ----
  var capAmount = 0;
  try{
    var shAlw = DB_sheet_('Alw_Std');
    var v4 = _sheetValues_(shAlw);
    var h4 = v4.shift() || [];
    var hm4 = DB_headerMap_(h4);

    var yI4 = hm4['year'];
    var catI4 = hm4['category'];
    var criI4 = hm4['criteria'];
    var amtI4 = hm4['amount'];

    var yKey4 = _normYear(yearSel);

    v4.some(function(r){
      if (_normYear(r[yI4]) !== yKey4) return false;
      if (String(r[catI4]||'').trim() !== '초과근무수당') return false;
      if (String(r[criI4]||'').trim() !== '상한액') return false;
      capAmount = _toNum(r[amtI4]);
      return true;
    });
  }catch(err){
    console.error(err);
  }

  var out = {
    years: years,
    employees: employees,
    salaryMap: salaryMap,
    capAmount: capAmount
  };
  __perfMeta.ok = true;
  __perfMeta.years = years.length;
  __perfMeta.employees = employees.length;
  __perfMeta.salaryKeys = Object.keys(salaryMap || {}).length;
  if (__perf && typeof DB_perfEnd_ === 'function') DB_perfEnd_(__perf, __perfMeta);
  return out;
}
