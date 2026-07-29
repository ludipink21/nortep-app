$ErrorActionPreference = "Stop"

$outputDir = "C:\Users\PC\Documents\Codex\2026-07-22\o-truevox-voltado-para-pesquisa-de\outputs"
$fileSpecs = @(
    @{ Source = "NorteP-Evolucao-e-Custos.md"; Base = "NorteP-Evolucao-e-Custos" },
    @{ Source = "Apresentacao-Curta-NorteP.md"; Base = "Apresentacao-Curta-NorteP" }
)

$testFile = Join-Path $outputDir "teste.docx"
if (Test-Path -LiteralPath $testFile) {
    Remove-Item -LiteralPath $testFile -Force
}

$wordApp = New-Object -ComObject Word.Application
$wordApp.Visible = $false
$wordApp.DisplayAlerts = 0

try {
    foreach ($spec in $fileSpecs) {
        $sourcePath = Join-Path $outputDir $spec.Source
        [string]$docxPath = Join-Path $outputDir ($spec.Base + ".docx")
        [string]$pdfPath = Join-Path $outputDir ($spec.Base + ".pdf")
        [string[]]$lines = Get-Content -LiteralPath $sourcePath -Encoding UTF8

        $doc = $wordApp.Documents.Add()
        $doc.PageSetup.TopMargin = $wordApp.CentimetersToPoints(1.8)
        $doc.PageSetup.BottomMargin = $wordApp.CentimetersToPoints(1.8)
        $doc.PageSetup.LeftMargin = $wordApp.CentimetersToPoints(2)
        $doc.PageSetup.RightMargin = $wordApp.CentimetersToPoints(2)
        $selection = $wordApp.Selection

        foreach ($line in $lines) {
            if ([string]::IsNullOrWhiteSpace($line)) {
                $selection.TypeParagraph()
                continue
            }

            if ($line -match "^# (.+)$") {
                $selection.Style = -63
                $selection.TypeText($Matches[1])
                $selection.TypeParagraph()
            }
            elseif ($line -match "^## (.+)$") {
                $selection.Style = -2
                $selection.TypeText($Matches[1])
                $selection.TypeParagraph()
            }
            elseif ($line -match "^### (.+)$") {
                $selection.Style = -3
                $selection.TypeText($Matches[1])
                $selection.TypeParagraph()
            }
            elseif ($line -match "^- (.+)$") {
                $selection.Style = -1
                $selection.Range.ListFormat.ApplyBulletDefault()
                $selection.TypeText(($Matches[1] -replace "\*\*", ""))
                $selection.TypeParagraph()
                $selection.Range.ListFormat.RemoveNumbers()
            }
            elseif ($line -match "^\|[-: |]+\|$") {
                continue
            }
            elseif ($line -match "^\|(.+)\|$") {
                $cells = $Matches[1].Split("|") | ForEach-Object { $_.Trim() }
                $selection.Style = -1
                $selection.Font.Name = "Calibri"
                $selection.Font.Size = 9
                $selection.TypeText(($cells -join "  |  "))
                $selection.TypeParagraph()
                $selection.Font.Size = 11
            }
            else {
                $selection.Style = -1
                $selection.TypeText(($line -replace "\*\*", ""))
                $selection.TypeParagraph()
            }
        }

        [int]$docxFormat = 16
        $doc.SaveAs([ref]$docxPath, [ref]$docxFormat)
        $doc.ExportAsFixedFormat($pdfPath, 17)
        $doc.Close([ref]0)
    }
}
finally {
    $wordApp.Quit([ref]0)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordApp) | Out-Null
}

Get-ChildItem -LiteralPath $outputDir |
    Where-Object { $_.Extension -in ".docx", ".pdf" } |
    Select-Object Name, Length, LastWriteTime
