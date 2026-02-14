/** employeeBundleService.js
 * - Employee + 하위 6개 시트 한번에 저장
 * - 방식: employee_id 기준 자식 테이블 Replace(삭제 후 재삽입)
 */

function _empPick_(payload, key){
  if (!payload) return null;
  if (payload[key] != null) return payload[key];
  if (payload.tables && payload.tables[key] != null) return payload.tables[key];
  if (payload.children && payload.children[key] != null) return payload.children[key];
  return null;
}

function _empPickRows_(payload, key){
  var v = _empPick_(payload, key);
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return [v];
  return [];
}

/** ✅ employee_id 같은 "수동 PK"를 그대로 넣어 Insert (Unlocked) */
function DB_insertManualIdUnlocked_(sheetName, obj, opts){
  opts = opts || {};
  var idField = opts.idField || 'id';
  var actor   = opts.actor || DB_getActor_();
  var autoFields = (opts.autoFields !== false);

  var sh = DB_sheet_(sheetName);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  if (map[idField] == null) throw new Error('ID 필드를 찾을 수 없습니다: ' + idField + ' in ' + sheetName);

  var manualId = String(obj[idField] || '').trim();
  if (!manualId) throw new Error(sheetName + ' 저장 실패: ' + idField + '가 비어있습니다.');

  // ✅ 중복 체크(같은 사번이면 신규 불가)
  var rowIndex = DB_findRowIndexByIdUnlocked_(sh, idField, manualId);
  if (rowIndex) throw new Error('이미 존재하는 ' + idField + ' 입니다: ' + manualId);

  if (autoFields) {
    var now = new Date();
    if (map['created_at'] != null && !obj.created_at) obj.created_at = now;
    if (map['updated_at'] != null) obj.updated_at = now;
    if (map['created_by'] != null) obj.created_by = DB_actorLabel_(actor);
    if (map['updated_by'] != null) obj.updated_by = DB_actorLabel_(actor);
  }

  sh.appendRow(DB_objToRow_(header, obj));
  return { ok:true, id: manualId };
}


function _empIsBlankRow_(obj, idField){
  var IGNORE = {
    'employee_id':true,
    'created_at':true,'created_by':true,'updated_at':true,'updated_by':true
  };
  IGNORE[idField] = true;

  var keys = Object.keys(obj || {});
  for (var i=0; i<keys.length; i++){
    var k = keys[i];
    if (IGNORE[k]) continue;

    var v = obj[k];
    if (v === true) return false;
    if (v == null) continue;
    if (typeof v === 'number' && !isNaN(v)) return false;

    var s = String(v).trim();
    if (s !== '') return false;
  }
  return true;
}

/** (projectBundleService에 있으면 재사용, 없으면 로컬 구현) */
function _empInsertUnlocked_(sheetName, obj, opts){
  if (typeof DB_insertUnlocked_ === 'function') {
    return DB_insertUnlocked_(sheetName, obj, opts);
  }
  // fallback: lock 없는 insert 구현(프로젝트 파일과 동일 로직)
  opts = opts || {};
  var idField = opts.idField || 'id';
  var actor   = opts.actor || DB_getActor_();
  var autoFields = (opts.autoFields !== false);

  var sh = DB_sheet_(sheetName);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  if (!(idField in map)) throw new Error('ID 필드를 찾을 수 없습니다: ' + idField + ' in ' + sheetName);

  var newId = DB_nextIntId_(sheetName, idField);
  obj[idField] = newId;

  if (autoFields) {
    var now = new Date();
    if (map['created_at'] != null && !obj.created_at) obj.created_at = now;
    if (map['updated_at'] != null) obj.updated_at = now;
    if (map['created_by'] != null) obj.created_by = DB_actorLabel_(actor);
    if (map['updated_by'] != null) obj.updated_by = DB_actorLabel_(actor);
  }

  var row = DB_objToRow_(header, obj);
  sh.appendRow(row);

  return { ok:true, id:newId };
}

function _empDeleteWhereUnlocked_(sh, colIndex1Based, matchValue){
  if (typeof DB_deleteWhereUnlocked_ === 'function') {
    return DB_deleteWhereUnlocked_(sh, colIndex1Based, matchValue);
  }
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  var values = sh.getRange(2, colIndex1Based, lastRow-1, 1).getValues();
  var del = [];
  var mv = String(matchValue || '').trim();

  for (var i=0; i<values.length; i++){
    if (String(values[i][0] || '').trim() === mv) del.push(i+2);
  }
  del.sort(function(a,b){ return b-a; });
  del.forEach(function(r){ sh.deleteRow(r); });
  return del.length;
}

function DB_replaceByEmployeeIdUnlocked_(sheetName, idField, employeeId, rows, actor){
  var sh = DB_sheet_(sheetName);
  var header = DB_header_(sh);
  var map = DB_headerMap_(header);

  if (map['employee_id'] == null){
    throw new Error(sheetName + ' 시트에 employee_id 컬럼이 없습니다. (헤더 추가 필요)');
  }
  if (map[idField] == null){
    throw new Error(sheetName + ' 시트에 PK 컬럼이 없습니다: ' + idField);
  }

  // 기존 employee_id 행 삭제
  var deleted = _empDeleteWhereUnlocked_(sh, map['employee_id']+1, employeeId);

  // 새로 insert(빈행 제외)
  var inserted = 0;
  rows = Array.isArray(rows) ? rows : [];

  rows.forEach(function(r){
    if (!r || typeof r !== 'object') return;

    r.employee_id = employeeId;

    if (_empIsBlankRow_(r, idField)) return;

    _empInsertUnlocked_(sheetName, r, {
      idField: idField,
      actor: actor,
      autoFields: true
    });
    inserted++;
  });

  return { deleted: deleted, inserted: inserted };
}