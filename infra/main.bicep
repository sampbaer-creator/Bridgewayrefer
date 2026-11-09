param location string = resourceGroup().location
@description('Globally unique lowercase application name, e.g. sso-referrals-12345')
param appName string
@description('Existing single-tenant Entra application client ID for staff sign-in')
param staffClientId string
@secure()
@description('Entra app client secret VALUE. Enter locally; never commit or send in chat.')
param staffClientSecret string
@description('Comma-separated Entra USER object IDs permitted to access patient data')
param staffObjectIds string
@description('Exact GitHub OIDC subject from the workflow token, including immutable owner and repository IDs')
param githubOidcSubject string = 'repo:SS-Ortho@352989860/sso-referrals@1447263787:ref:refs/heads/main'
@allowed(['F1', 'B1'])
@description('F1 for evaluation where available; B1 is paid. Confirm price before choosing.')
param sku string = 'F1'
var storageName = 'ssoref${uniqueString(resourceGroup().id, appName)}'
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    publicNetworkAccess: 'Enabled'
  }
}
resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}
resource table 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: 'referrals'
}
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  kind: 'linux'
  sku: { name: sku, tier: sku == 'F1' ? 'Free' : 'Basic' }
  properties: { reserved: true }
}
resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      appCommandLine: 'gunicorn --bind=0.0.0.0:8000 --workers=2 --timeout=60 "app:create_app()"'
      alwaysOn: sku != 'F1'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        { name: 'TABLE_ENDPOINT', value: storage.properties.primaryEndpoints.table }
        { name: 'PUBLIC_ORIGIN', value: 'https://${appName}.azurewebsites.net' }
        { name: 'STAFF_OBJECT_IDS', value: toLower(staffObjectIds) }
        { name: 'TENANT_ID', value: tenant().tenantId }
        { name: 'STAFF_CLIENT_SECRET', value: staffClientSecret }
        { name: 'ACCEPT_REFERRALS', value: '0' }
        { name: 'DEMO_MODE', value: '0' }
      ]
    }
  }
}
resource auth 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: app
  name: 'authsettingsV2'
  properties: {
    platform: { enabled: true }
    globalValidation: { requireAuthentication: false, unauthenticatedClientAction: 'AllowAnonymous' }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: staffClientId
          clientSecretSettingName: 'STAFF_CLIENT_SECRET'
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'
        }
        validation: { allowedAudiences: [staffClientId, 'api://${staffClientId}'] }
      }
    }
    login: { tokenStore: { enabled: true } }
    httpSettings: { requireHttps: true }
  }
}
resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, app.id, 'table-contributor')
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${appName}-github'
  location: location
}
resource federated 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deployIdentity
  name: 'github-main'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: githubOidcSubject
    audiences: ['api://AzureADTokenExchange']
  }
}
resource deployRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(app.id, deployIdentity.id, 'website-contributor')
  scope: app
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'de139f84-1756-47ae-9be6-808fbbe84772')
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}
output applicationUrl string = 'https://${app.properties.defaultHostName}'
output azureClientId string = deployIdentity.properties.clientId
output azureTenantId string = tenant().tenantId
output azureSubscriptionId string = subscription().subscriptionId
output azureWebappName string = app.name
