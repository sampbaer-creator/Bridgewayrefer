using Azure.Core;
using Azure.Identity;
using SkiaSharp;

namespace BridgeWay.Api;

public sealed class BusinessLogoStorage(IHttpClientFactory clients, IConfiguration configuration)
{
    public const int MaxFileBytes = 2 * 1024 * 1024;
    public const int MaxRequestBytes = 2_800_000;
    static readonly TokenCredential Credential = new DefaultAzureCredential();

    public async Task<string> Upload(string? base64, CancellationToken ct)
    {
        var account = configuration["LogoStorage:Account"];
        if (account is null || !System.Text.RegularExpressions.Regex.IsMatch(account, @"\A[a-z0-9]{3,24}\z"))
            throw new ApiError(503, "Logo uploads are not configured.");
        if (string.IsNullOrEmpty(base64) || base64.Length > ((MaxFileBytes + 2) / 3) * 4)
            throw new ApiError(400, "Choose a logo up to 2 MB.");

        using var image = Encode(base64);
        var url = $"https://{account}.blob.core.windows.net/logos/{Guid.NewGuid():N}.png";
        var token = await Credential.GetTokenAsync(new TokenRequestContext(["https://storage.azure.com/.default"]), ct);
        using var request = new HttpRequestMessage(HttpMethod.Put, url) { Content = new StreamContent(image.AsStream()) };
        request.Headers.Authorization = new("Bearer", token.Token);
        request.Headers.TryAddWithoutValidation("x-ms-version", "2023-11-03");
        request.Headers.TryAddWithoutValidation("x-ms-blob-type", "BlockBlob");
        request.Headers.TryAddWithoutValidation("x-ms-blob-cache-control", "public, max-age=31536000, immutable");
        request.Headers.TryAddWithoutValidation("If-None-Match", "*");
        request.Content.Headers.ContentType = new("image/png");
        using var client = clients.CreateClient();
        using var response = await client.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return url;
    }

    internal static SKData Encode(string base64)
    {
        byte[] bytes;
        try { bytes = Convert.FromBase64String(base64); }
        catch (FormatException) { throw new ApiError(400, "Choose a valid PNG, JPEG, or WebP logo."); }

        if (bytes.Length == 0 || bytes.Length > MaxFileBytes)
            throw new ApiError(400, "Choose a logo up to 2 MB.");

        using var codec = SKCodec.Create(new SKMemoryStream(bytes));
        if (codec is null || codec.EncodedFormat is not (SKEncodedImageFormat.Png or SKEncodedImageFormat.Jpeg or SKEncodedImageFormat.Webp))
            throw new ApiError(400, "Choose a valid PNG, JPEG, or WebP logo.");
        if (codec.Info.Width is < 1 or > 2048 || codec.Info.Height is < 1 or > 2048)
            throw new ApiError(400, "Logo dimensions must be at most 2048 by 2048 pixels.");

        using var bitmap = new SKBitmap(new SKImageInfo(codec.Info.Width, codec.Info.Height, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (codec.GetPixels(bitmap.Info, bitmap.GetPixels()) != SKCodecResult.Success)
            throw new ApiError(400, "The logo could not be decoded.");
        return bitmap.Encode(SKEncodedImageFormat.Png, 100) ?? throw new ApiError(400, "The logo could not be converted.");
    }
}
