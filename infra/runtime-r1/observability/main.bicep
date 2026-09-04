targetScope = 'resourceGroup'

@description('Environment short name (dev|stg|prod).')
param environment string

@description('Azure region for observability resources.')
param location string = resourceGroup().location

@description('Resource name prefix. Defaults to aios-r1-<env>.')
param namePrefix string = 'aios-r1-${environment}'

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string = '${namePrefix}-law'

@description('Application Insights component name.')
param applicationInsightsName string = '${namePrefix}-appi'

@allowed([
  'PerGB2018'
  'CapacityReservation'
])
@description('Log Analytics SKU.')
param logAnalyticsSku string = 'PerGB2018'

@minValue(30)
@maxValue(730)
@description('Log Analytics retention in days.')
param logAnalyticsRetentionInDays int = 90

@description('Workspace data export settings for cost and retention governance.')
param enableWorkspaceDailyCap bool = false

@minValue(-1)
@description('Daily cap in GB for Log Analytics. -1 disables cap.')
param logAnalyticsDailyCapGb int = -1

@description('Optional additional tags applied to observability resources.')
param tags object = {}

@description('Resource IDs for diagnostics and alert scopes. Empty entries are ignored.')
param diagnosticScopes object = {
  serviceBusNamespaceResourceId: ''
  keyVaultResourceId: ''
  containerAppsEnvironmentResourceId: ''
  controlPlaneContainerAppResourceId: ''
  masonContainerAppResourceId: ''
  juliusContainerAppResourceId: ''
  workerContainerAppResourceId: ''
}

@description('Action Group configuration for alert notifications.')
param actionGroup object = {
  enabled: true
  name: '${namePrefix}-ag-runtime-alerts'
  shortName: 'aiosr1ops'
  emailReceivers: []
  webhookReceivers: []
}

@description('Metric alert threshold configuration.')
param alertThresholds object = {
  appInsightsFailedRequestsCount: 25
  appInsightsResponseTimeMs: 3000
  serviceBusIncomingMessagesCount: 1000
  serviceBusDeadletterCount: 50
  keyVaultApiResult5xxCount: 5
}

@description('Enable diagnostic settings for supported scopes.')
param enableDiagnostics bool = true

module workspace './modules/log-analytics.bicep' = {
  name: 'log-analytics-workspace'
  params: {
    location: location
    workspaceName: logAnalyticsWorkspaceName
    skuName: logAnalyticsSku
    retentionInDays: logAnalyticsRetentionInDays
    enableDailyCap: enableWorkspaceDailyCap
    dailyCapGb: logAnalyticsDailyCapGb
    tags: union({
      environment: environment
      workload: 'runtime-r1'
      scope: 'observability'
    }, tags)
  }
}

module appInsights './modules/application-insights.bicep' = {
  name: 'application-insights'
  params: {
    location: location
    appInsightsName: applicationInsightsName
    workspaceResourceId: workspace.outputs.workspaceResourceId
    tags: union({
      environment: environment
      workload: 'runtime-r1'
      scope: 'observability'
    }, tags)
  }
}

module actionGroupModule './modules/action-group.bicep' = if (actionGroup.enabled) {
  name: 'monitor-action-group'
  params: {
    actionGroupName: actionGroup.name
    shortName: actionGroup.shortName
    location: 'Global'
    tags: union({
      environment: environment
      workload: 'runtime-r1'
      scope: 'observability'
    }, tags)
    emailReceivers: actionGroup.emailReceivers
    webhookReceivers: actionGroup.webhookReceivers
  }
}

module diagnostics './modules/diagnostic-settings.bicep' = if (enableDiagnostics) {
  name: 'diagnostic-settings'
  params: {
    workspaceResourceId: workspace.outputs.workspaceResourceId
    scopes: diagnosticScopes
    diagnosticSettingName: 'r1-observability'
  }
}

module metricAlerts './modules/metric-alerts.bicep' = if (actionGroup.enabled) {
  name: 'metric-alerts'
  params: {
    appInsightsResourceId: appInsights.outputs.applicationInsightsResourceId
    serviceBusNamespaceResourceId: diagnosticScopes.serviceBusNamespaceResourceId
    keyVaultResourceId: diagnosticScopes.keyVaultResourceId
    actionGroupResourceId: actionGroupModule.outputs.actionGroupResourceId
    thresholds: alertThresholds
  }
}

module workbook './modules/workbook-template.bicep' = {
  name: 'workbook-template'
  params: {
    location: location
    workbookDisplayName: '${namePrefix}-runtime-observability'
    workspaceResourceId: workspace.outputs.workspaceResourceId
    appInsightsResourceId: appInsights.outputs.applicationInsightsResourceId
    tags: union({
      environment: environment
      workload: 'runtime-r1'
      scope: 'observability'
    }, tags)
  }
}

output logAnalyticsWorkspaceResourceId string = workspace.outputs.workspaceResourceId
output appInsightsResourceId string = appInsights.outputs.applicationInsightsResourceId
output appInsightsConnectionString string = appInsights.outputs.connectionString
output actionGroupResourceId string = actionGroup.enabled ? actionGroupModule.outputs.actionGroupResourceId : ''
output diagnosticSettings object = enableDiagnostics ? diagnostics.outputs.diagnosticSettingResourceIds : {}
output metricAlertResourceIds array = actionGroup.enabled ? metricAlerts.outputs.metricAlertResourceIds : []
output workbookResourceId string = workbook.outputs.workbookResourceId
output deploymentNotes object = {
  message: 'Epic E3 provisions observability infrastructure only. No runtime application instrumentation is deployed in this template.'
  diagnosticsEnabled: enableDiagnostics
  actionGroupEnabled: actionGroup.enabled
}
