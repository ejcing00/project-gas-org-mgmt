/** excelXmlWriter.js
 * - Excel 2003 XML(SpreadsheetML)로 멀티시트 .xls 생성
 */

function ExcelXmlWriter_write_(workbookData, fileName){
  var xml = ExcelXmlWriter_buildXml_(workbookData);
  return Utilities.newBlob(xml, 'application/vnd.ms-excel', fileName || 'export.xls');
}

function ExcelXmlWriter_buildXml_(workbookData){
  workbookData = workbookData || {};
  var sheets = workbookData.sheets || [];

  var out = [];
  out.push('<?xml version="1.0"?>');
  out.push('<?mso-application progid="Excel.Sheet"?>');
  out.push('<Workbook'
    + ' xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
    + ' xmlns:o="urn:schemas-microsoft-com:office:office"'
    + ' xmlns:x="urn:schemas-microsoft-com:office:excel"'
    + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"'
    + ' xmlns:html="http://www.w3.org/TR/REC-html40"'
    + '>');

  // Styles (header bold)
  out.push('<Styles>');
  out.push('  <Style ss:ID="sHeader"><Font ss:Bold="1"/></Style>');
  out.push('</Styles>');

  for (var i=0; i<sheets.length; i++){
    var sh = sheets[i] || {};
    var safeName = ExcelXmlWriter_sanitizeSheetName_(String(sh.name || ('Sheet'+(i+1))));
    var name = ExcelXmlWriter_escapeAttr_(safeName);
    var values = sh.values || [];

    out.push('<Worksheet ss:Name="' + name + '">');
    out.push('<Table>');

    for (var r=0; r<values.length; r++){
      var row = values[r] || [];
      out.push('<Row>');

      for (var c=0; c<row.length; c++){
        var v = row[c];

        // header row style
        var styleAttr = (r === 0) ? ' ss:StyleID="sHeader"' : '';

        var cell = ExcelXmlWriter_cellXml_(v, styleAttr);
        out.push(cell);
      }

      out.push('</Row>');
    }

    out.push('</Table>');
    out.push('</Worksheet>');
  }

  out.push('</Workbook>');
  return out.join('');
}

function ExcelXmlWriter_cellXml_(v, styleAttr){
  styleAttr = styleAttr || '';

  if (v === null || v === undefined || v === ''){
    return '<Cell' + styleAttr + '><Data ss:Type="String"></Data></Cell>';
  }

  // Date
  if (Object.prototype.toString.call(v) === '[object Date]'){
    // Excel DateTime: 2026-01-08T12:34:56.000
    var tz = Session.getScriptTimeZone() || 'Asia/Seoul';
    var s = Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss'.000'");
    return '<Cell' + styleAttr + '><Data ss:Type="DateTime">' + ExcelXmlWriter_escapeText_(s) + '</Data></Cell>';
  }

  // Number
  if (typeof v === 'number' && isFinite(v)){
    return '<Cell' + styleAttr + '><Data ss:Type="Number">' + String(v) + '</Data></Cell>';
  }

  // Boolean
  if (typeof v === 'boolean'){
    return '<Cell' + styleAttr + '><Data ss:Type="Boolean">' + (v ? '1' : '0') + '</Data></Cell>';
  }

  // String
  return '<Cell' + styleAttr + '><Data ss:Type="String">' + ExcelXmlWriter_escapeText_(String(v)) + '</Data></Cell>';
}

function ExcelXmlWriter_escapeText_(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}

function ExcelXmlWriter_escapeAttr_(s){
  // attr도 동일 처리
  return ExcelXmlWriter_escapeText_(s);
}

function ExcelXmlWriter_sanitizeSheetName_(name){
  name = String(name || 'Sheet').trim();
  // Excel 금지문자: : \ / ? * [ ]
  name = name.replace(/[:\\\/\?\*\[\]]/g, '-');

  // 길이 제한(Excel 시트명 31자)
  if (name.length > 31) name = name.slice(0, 31);

  // 빈 값 방지
  if (!name) name = 'Sheet';
  return name;
}
