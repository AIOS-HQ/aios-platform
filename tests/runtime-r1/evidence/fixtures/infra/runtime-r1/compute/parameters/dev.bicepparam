using '../main.bicep'
param managedIdentityResourceIds = []
param logAnalyticsWorkspaceResourceId = '/subscriptions/x/resourceGroups/rg/providers/Microsoft.OperationalInsights/workspaces/la-dev'
param appInsightsConnectionString = 'InstrumentationKey=abc;IngestionEndpoint=https://example.com'
