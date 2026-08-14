<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:da="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <xsl:variable name="doc" select="da:DespatchAdvice | DespatchAdvice"/>
    <html>
      <head>
        <meta charset="UTF-8"/>
        <title>e-İrsaliye</title>
        <style type="text/css">
          body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 24px; }
          h1 { font-size: 20px; margin: 0 0 4px 0; }
          .muted { color: #555; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
          th { background: #f2f2f2; }
          .meta td { border: none; padding: 2px 8px 2px 0; }
          .parties td { vertical-align: top; width: 50%; }
          .qty { text-align: right; }
          .footer { margin-top: 16px; font-size: 11px; color: #444; }
        </style>
      </head>
      <body>
        <h1>e-İrsaliye</h1>
        <p class="muted">SEVK — TEMELİRSALİYE</p>
        <table class="meta">
          <tr><td><b>İrsaliye No</b></td><td><xsl:value-of select="$doc/cbc:ID"/></td></tr>
          <tr><td><b>Tarih</b></td><td><xsl:value-of select="$doc/cbc:IssueDate"/> <xsl:value-of select="$doc/cbc:IssueTime"/></td></tr>
          <tr><td><b>ETTN</b></td><td><xsl:value-of select="$doc/cbc:UUID"/></td></tr>
        </table>
        <br/>
        <table class="parties">
          <tr>
            <td>
              <b>Gönderici</b><br/>
              <xsl:value-of select="$doc/cac:DespatchSupplierParty/cac:Party/cac:PartyName/cbc:Name"/><br/>
              VKN/TCKN: <xsl:value-of select="$doc/cac:DespatchSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID"/><br/>
              <xsl:value-of select="$doc/cac:DespatchSupplierParty/cac:Party/cac:PostalAddress/cbc:StreetName"/>
            </td>
            <td>
              <b>Alıcı</b><br/>
              <xsl:value-of select="$doc/cac:DeliveryCustomerParty/cac:Party/cac:PartyName/cbc:Name"/><br/>
              VKN/TCKN: <xsl:value-of select="$doc/cac:DeliveryCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID"/><br/>
              <xsl:value-of select="$doc/cac:DeliveryCustomerParty/cac:Party/cac:PostalAddress/cbc:StreetName"/>
            </td>
          </tr>
        </table>
        <br/>
        <table>
          <thead>
            <tr>
              <th>Sıra</th>
              <th>Mal / Hizmet</th>
              <th>Lot</th>
              <th class="qty">Miktar</th>
            </tr>
          </thead>
          <tbody>
            <xsl:for-each select="$doc/cac:DespatchLine">
              <tr>
                <td><xsl:value-of select="cbc:ID"/></td>
                <td><xsl:value-of select="cac:Item/cbc:Name"/></td>
                <td><xsl:value-of select="cac:Item/cac:AdditionalItemIdentification/cbc:ID"/></td>
                <td class="qty"><xsl:value-of select="cbc:DeliveredQuantity"/></td>
              </tr>
            </xsl:for-each>
          </tbody>
        </table>
        <p class="footer">Bu belgede birim fiyat ve tutar yer almaz.</p>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
