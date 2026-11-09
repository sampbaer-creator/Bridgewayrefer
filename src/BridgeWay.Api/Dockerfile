FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/BridgeWay.Api/BridgeWay.Api.csproj src/BridgeWay.Api/
RUN dotnet restore src/BridgeWay.Api/BridgeWay.Api.csproj
COPY src/BridgeWay.Api/ src/BridgeWay.Api/
RUN dotnet publish src/BridgeWay.Api/BridgeWay.Api.csproj -c Release -o /out /p:UseAppHost=false

FROM base
WORKDIR /app
COPY --from=build /out .
ENTRYPOINT ["dotnet", "BridgeWay.Api.dll"]
