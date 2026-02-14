/** excelExportController.js */

// 클라이언트가 google.script.run으로 호출
function EXPORT_downloadExcel(req){
  try{
    req = req || {};

    // ✅ 권한 체크(키가 있으면 체크)
    if (req.permKey) DB_assertPerm_(req.permKey);

    // ✅ workbook 만들기(1단계는 테스트용)
    var wb = ExcelExportService_buildWorkbook_(req);

    // ✅ Excel XML(.xls) 생성
    var fileName = String(req.fileName || ExcelExportService_defaultFileName_(req) || 'export.xls');
    var blob = ExcelXmlWriter_write_(wb, fileName);

    return {
      ok: true,
      fileName: fileName,
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes())
    };

  } catch(err){
    return {
      ok: false,
      message: (err && err.message) ? err.message : String(err),
      code: 'EXPORT_FAILED'
    };
  }
}
