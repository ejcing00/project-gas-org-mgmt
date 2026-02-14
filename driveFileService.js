/**
 * DriveFileService (server)
 * - Drive 업로드/다운로드 공통 유틸
 * - '다음 사용자 인증정보: 나' 환경에서 내 Drive에 저장
 *
 * 의존:
 * - DB_assertPerm_(permKey)  (dbCore.js)
 * - DB_getActor_(), DB_actorLabel_()  (dbCore.js)
 */

var FILEUTIL_ROOT_FOLDER_PROP = 'FILEUTIL_ROOT_FOLDER_ID';
var FILEUTIL_ROOT_FOLDER_NAME = 'APP_Files';

function FILEUTIL__assert_(permKey){
  permKey = String(permKey || '').trim();
  if (permKey) return DB_assertPerm_(permKey);
  return DB_getActor_();
}

function FILEUTIL__getOrCreateRootFolder_(){
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty(FILEUTIL_ROOT_FOLDER_PROP) || '').trim();
  if (id){
    try{ return DriveApp.getFolderById(id); }catch(e){ /* fallthrough */ }
  }

  // 동일 이름 폴더가 있으면 재사용
  var it = DriveApp.getRootFolder().getFoldersByName(FILEUTIL_ROOT_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(FILEUTIL_ROOT_FOLDER_NAME);
  props.setProperty(FILEUTIL_ROOT_FOLDER_PROP, folder.getId());
  return folder;
}

function FILEUTIL__getOrCreateSubFolder_(rootFolder, folderKey){
  folderKey = String(folderKey || '').trim();
  if (!folderKey) throw new Error('folderKey가 없습니다.');

  // folderKey는 "A/B/C" 형태도 허용
  var parts = folderKey.split('/').map(function(s){ return String(s||'').trim(); }).filter(Boolean);
  var cur = rootFolder;
  parts.forEach(function(name){
    var it = cur.getFoldersByName(name);
    cur = it.hasNext() ? it.next() : cur.createFolder(name);
  });
  return cur;
}

function FILEUTIL__dataUrlToBlob_(dataUrl, mimeType, fileName){
  var m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error('data_url 형식이 올바르지 않습니다.');
  var mime = mimeType || m[1] || 'application/octet-stream';
  var b64 = m[2] || '';
  var bytes = Utilities.base64Decode(b64);
  return Utilities.newBlob(bytes, mime, fileName || 'upload');
}

// ✅ 파일명 안전 처리(Windows 금지문자 최소 치환)
function FILEUTIL__safeName_(s){
  s = String(s || '').trim();
  return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\\s+/g, ' ').trim();
}
/**
 * 공통 업로드
 * payload: { permKey?, folderKey, file_name, mime_type, size, data_url }
 */
function FILEUTIL_upload(payload){
  payload = payload || {};
  var actor = FILEUTIL__assert_(payload.permKey);

  var folderKey = String(payload.folderKey || '').trim();
  var fileName = String(payload.file_name || '').trim() || 'upload';
  var mimeType = String(payload.mime_type || '').trim() || 'application/octet-stream';
  var size = Number(payload.size || 0) || 0;
  var dataUrl = String(payload.data_url || '');

  var root = FILEUTIL__getOrCreateRootFolder_();
  var folder = FILEUTIL__getOrCreateSubFolder_(root, folderKey);

  var blob = FILEUTIL__dataUrlToBlob_(dataUrl, mimeType, fileName);
  var file = folder.createFile(blob);

  return {
    ok: true,
    file_id: file.getId(),
    file_name: file.getName(),
    mime_type: mimeType,
    size: size,
    drive_url: file.getUrl(),
    created_by: DB_actorLabel_(actor)
  };
}

/**
 * 공통 다운로드 (base64)
 * payload: { permKey?, file_id }
 */
function FILEUTIL_download(payload){
  payload = payload || {};
  FILEUTIL__assert_(payload.permKey);

  var fileId = String(payload.file_id || '').trim();
  if (!fileId) return { ok:false, message:'file_id가 없습니다.' };

  try{
    var f = DriveApp.getFileById(fileId);
    var blob = f.getBlob();
    var bytes = blob.getBytes();
    var b64 = Utilities.base64Encode(bytes);

    return {
      ok: true,
      file_id: fileId,
      file_name: f.getName(),
      mime_type: blob.getContentType() || 'application/octet-stream',
      data_base64: b64
    };
  }catch(e){
    return { ok:false, message:(e && e.message) ? e.message : String(e) };
  }
}


/**
 * 공통 다운로드(zip, base64)
 * payload: { permKey?, zip_name, items:[{file_id, filenamePrefix}] }
 * - zip 내부 파일명: filenamePrefix + '_' + (Drive 저장 파일명)
 * - zip 파일명: zip_name + '.zip'
 */
function FILEUTIL_downloadZip(payload){
  payload = payload || {};
  FILEUTIL__assert_(payload.permKey);

  var zipName = FILEUTIL__safeName_(payload.zip_name || 'download');
  var items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return { ok:false, message:'items가 없습니다.' };

  try{
    var blobs = [];
    items.forEach(function(it){
      var fileId = String(it.file_id || '').trim();
      if (!fileId) return;
      var prefix = FILEUTIL__safeName_(it.filenamePrefix || '');
      var f = DriveApp.getFileById(fileId);
      var b = f.getBlob();
      var baseName = FILEUTIL__safeName_(f.getName());
      var entryName = (prefix ? (prefix + '_' + baseName) : baseName);
      blobs.push(b.setName(entryName));
    });

    if (!blobs.length) return { ok:false, message:'다운로드 가능한 파일이 없습니다.' };

    var zipBlob = Utilities.zip(blobs, zipName);
    zipBlob.setName(zipName + '.zip');

    var bytes = zipBlob.getBytes();
    var b64 = Utilities.base64Encode(bytes);

    return {
      ok: true,
      file_name: zipBlob.getName(),
      mime_type: 'application/zip',
      data_base64: b64
    };
  }catch(e){
    return { ok:false, message:(e && e.message) ? e.message : String(e) };
  }
}

/**
 * 공통 삭제(Drive)
 * payload: { permKey?, file_id, hard? }
 * - hard=true + Advanced Drive API(Drive.Files.remove)가 켜져 있으면 영구삭제 시도
 * - 기본은 휴지통 이동(setTrashed)
 */
function FILEUTIL_delete(payload){
  payload = payload || {};
  FILEUTIL__assert_(payload.permKey);

  var fileId = String(payload.file_id || '').trim();
  if (!fileId) return { ok:false, message:'file_id가 없습니다.' };

  var hard = (payload.hard === true || payload.hard === 1 || String(payload.hard||'') === '1');
  try{
    if (hard && typeof Drive !== 'undefined' && Drive.Files && typeof Drive.Files.remove === 'function'){
      Drive.Files.remove(fileId);
      return { ok:true, file_id:fileId, deleted:'hard' };
    }
  }catch(e){
    // hard 실패 시 휴지통으로 fallback
  }

  try{
    DriveApp.getFileById(fileId).setTrashed(true);
    return { ok:true, file_id:fileId, deleted:'trashed' };
  }catch(e2){
    return { ok:false, message:(e2 && e2.message) ? e2.message : String(e2) };
  }
}

/**
 * 공통 다중삭제
 * payload: { permKey?, file_ids:[...], hard? }
 */
function FILEUTIL_deleteMany(payload){
  payload = payload || {};
  FILEUTIL__assert_(payload.permKey);

  var ids = Array.isArray(payload.file_ids) ? payload.file_ids : [];
  var hard = payload.hard;
  var out = { ok:true, deleted:[], failed:[] };

  ids.forEach(function(id){
    id = String(id || '').trim();
    if (!id) return;
    var r = FILEUTIL_delete({ permKey:'', file_id:id, hard:hard }); // permKey는 이미 assert 했으니 빈값
    if (r && r.ok) out.deleted.push(id);
    else out.failed.push({ file_id:id, message:(r && r.message) ? r.message : '삭제 실패' });
  });

  if (out.failed.length) out.ok = false;
  return out;
}