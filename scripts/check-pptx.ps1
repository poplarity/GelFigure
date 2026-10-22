# Optional native validation on Windows with PowerPoint installed. Synthetic exports only.
# Example: powershell -File scripts/check-pptx.ps1 -Folder test-results/pptx/chromium
param([Parameter(Mandatory=$true)][string]$Folder,[string[]]$Names=@('editable', 'spliced', 'protein'))
$ErrorActionPreference = 'Stop'
$dir = (Resolve-Path -LiteralPath $Folder).Path
$pp = New-Object -ComObject PowerPoint.Application
$report = @()
try {
  $pp.DisplayAlerts = 1
  foreach ($name in $Names) {
    $inputFile = Join-Path $dir ($name + '.pptx')
    if (!(Test-Path -LiteralPath $inputFile)) { continue }
    $pres = $pp.Presentations.Open($inputFile, -1, 0, 0)
    try {
      if ($pres.Slides.Count -ne 1) { throw 'Expected one finished-figure slide' }
      $slide = $pres.Slides.Item(1)
      $width = $pres.PageSetup.SlideWidth
      $height = $pres.PageSetup.SlideHeight
      $slide.Export((Join-Path $dir ($name + '-powerpoint.png')), 'PNG', 1600, [int](1600 * $height / $width))
      $texts = @(); $pictures = @(); $lineCount = 0; $shapeCount = $slide.Shapes.Count
      foreach ($s in $slide.Shapes) {
        if ($s.Type -eq 13) {
          $left = $s.PictureFormat.CropLeft
          $s.PictureFormat.CropLeft = $left + 1
          $edit = [math]::Abs($s.PictureFormat.CropLeft - ($left + 1)) -lt .01
          $s.PictureFormat.CropLeft = [double]$left
          $pictures += [pscustomobject]@{name=$s.Name;left=$s.Left;top=$s.Top;width=$s.Width;height=$s.Height;cropLeft=$left;cropRight=$s.PictureFormat.CropRight;cropTop=$s.PictureFormat.CropTop;cropBottom=$s.PictureFormat.CropBottom;cropEditable=$edit}
          if (!$edit) { throw 'Picture crop was not editable' }
        } elseif ($s.HasTextFrame -and $s.TextFrame.HasText) {
          $tr = $s.TextFrame.TextRange
          $texts += [pscustomobject]@{text=$tr.Text;left=$s.Left;top=$s.Top;width=$s.Width;height=$s.Height;boundLeft=$tr.BoundLeft;boundTop=$tr.BoundTop;boundWidth=$tr.BoundWidth;boundHeight=$tr.BoundHeight;font=$tr.Font.Name;size=$tr.Font.Size;rotation=$s.Rotation}
        } else { $lineCount++ }
      }
      if (!$texts.Count -or !$pictures.Count -or !$lineCount) { throw 'Missing editable text, images or shapes' }
      $firstText = @($slide.Shapes | Where-Object { $_.HasTextFrame -and $_.TextFrame.HasText })[0]
      $firstText.TextFrame.TextRange.Text = 'Edited text'
      if ($firstText.TextFrame.TextRange.Text -ne 'Edited text') { throw 'Text was not editable' }
      $copy = Join-Path $dir ($name + '-roundtrip.pptx')
      $pres.SaveCopyAs($copy, 24)
      $report += [pscustomobject]@{file=$name;version=$pp.Version;width=$width;height=$height;shapes=$shapeCount;texts=$texts;pictures=$pictures;otherShapes=$lineCount;textEditable=$true}
      $pres.Saved = -1
    } finally { $pres.Close() }
  }
} finally { $pp.Quit() }
$json = $report | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText((Join-Path $dir 'powerpoint-check.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
$report | ForEach-Object { Write-Output ("{0}: opened, {1} text boxes, {2} recroppable pictures, {3} other shapes; edits and re-save passed" -f $_.file,$_.texts.Count,$_.pictures.Count,$_.otherShapes) }
