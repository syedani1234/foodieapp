# 1. First, create .env file if not exists
if (-not (Test-Path .env)) {
    "REACT_APP_API_URL=http://localhost:4000" | Set-Content .env
    Write-Host "Created .env file"
}

# 2. Fix all problematic files
$filesToFix = @(
    @{Path="src/components/DealDialog.jsx"; Search="const API_BASE_URL = import.meta.env.VITE_API_URL || API_BASE_URL;"; Replace="import API_BASE_URL from '../config/api';"},
    @{Path="src/pages/CheckoutPage.jsx"; Search="`\`${import.meta.env.VITE_API_URL || `"http://localhost:4000`"}/api/orders"; Replace="`\`${process.env.REACT_APP_API_URL || `"http://localhost:4000`"}/api/orders"},
    @{Path="src/pages/CuisineFilterPage.jsx"; Search="`\`${import.meta.env.VITE_API_URL || `"http://localhost:4000`"}/api/cuisines"; Replace="`\`${process.env.REACT_APP_API_URL || `"http://localhost:4000`"}/api/cuisines"},
    @{Path="src/pages/OrderConfirmationPage.jsx"; Search="const API_BASE_URL = API_BASE_URL;"; Replace=""},
    @{Path="src/pages/RestaurantPage.jsx"; Search="const API_BASE_URL = API_BASE_URL;"; Replace=""},
    @{Path="src/hooks/useCuisineData.js"; Search="const API_BASE_URL = process.env.REACT_APP_API_URL || API_BASE_URL;"; Replace=""},
    @{Path="src/hooks/useDealsData.js"; Search="const API_BASE_URL = API_BASE_URL;"; Replace=""},
    @{Path="src/hooks/useRestaurantData.js"; Search="`\`${import.meta.env.VITE_API_URL || `"http://localhost:4000`"}/restaurants"; Replace="`\`${process.env.REACT_APP_API_URL || `"http://localhost:4000`"}/restaurants"}
)

foreach ($file in $filesToFix) {
    if (Test-Path $file.Path) {
        Write-Host "Fixing: $($file.Path)"
        $content = Get-Content $file.Path -Raw
        $content = $content -replace $file.Search, $file.Replace
        Set-Content $file.Path -Value $content -NoNewline
    }
}

# 3. Add imports to files that need API_BASE_URL
$filesNeedingImport = @(
    "src/pages/OrderConfirmationPage.jsx",
    "src/pages/RestaurantPage.jsx", 
    "src/hooks/useCuisineData.js",
    "src/hooks/useDealsData.js",
    "src/pages/RestaurantDetailsPage.jsx",
    "src/utils/formatImageUrl.js"
)

foreach ($file in $filesNeedingImport) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        if ($content -match 'API_BASE_URL' -and $content -notmatch 'import.*API_BASE_URL.*config/api') {
            Write-Host "Adding import to: $file"
            # Calculate correct relative path
            $relativePath = if ($file -match "src/pages/") { "./config/api" }
                           elseif ($file -match "src/hooks/") { "../config/api" }
                           elseif ($file -match "src/utils/") { "../config/api" }
                           else { "../config/api" }
            
            $content = "import API_BASE_URL from '$relativePath';`n" + $content
            Set-Content $file -Value $content -NoNewline
        }
    }
}

Write-Host "`n? All fixes applied!"
Write-Host "Now run: npm run build"
