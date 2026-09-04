targetScope = 'resourceGroup'

@description('Environment short name (dev|stg|prod).')
param environment string

@description('Azure region for runtime compute resources.')
param location string = resourceGroup().location

@description('Resource name prefix. Defaults to aios-r1-<env>.')
param namePrefix string = 'aios-r1-${environment}'

@description('Container Apps environment name.')
param containerAppsEnvironmentName string = '${namePrefix}-ca-env'

@description('Log Analytics workspace resource ID created in Epic E3.')
param logAnalyticsWorkspaceResourceId string

@description('Application Insights connection string from Epic E3 output. Optional if runtime uses OTel exporter envs later.')
param appInsightsConnectionString string = ''

@description('Container registry server name (e.g. <registry>.azurecr.io).')
param containerRegistryServer string

@description('Optional container registry identity resource ID for pull auth.')
param containerRegistryIdentityResourceId string = ''

@description('Key Vault URI used for secret references in Container Apps.')
param keyVaultUri string

@description('Managed identity resource IDs provisioned in Epic E1.')
param managedIdentityResourceIds object = {
  harmony: ''
  executionApi: ''
  mason: ''
  julius: ''
  workerRuntime: ''
  futureRuntime: ''
}

@description('Container image references keyed by service role.')
param containerImages object = {
  harmony: '${containerRegistryServer}/aios/harmony:latest'
  executionApi: '${containerRegistryServer}/aios/execution-api:latest'
  mason: '${containerRegistryServer}/aios/mason:latest'
  julius: '${containerRegistryServer}/aios/julius:latest'
  workerRuntime: '${containerRegistryServer}/aios/worker-runtime:latest'
  futureRuntime: '${containerRegistryServer}/aios/future-runtime:latest'
}

@description('Per-service runtime settings keyed by service role.')
param serviceConfig object = {
  harmony: {
    cpu: 1
    memory: '2Gi'
    minReplicas: 2
    maxReplicas: 10
    targetConcurrency: 50
    externalIngress: true
    targetPort: 3000
    transport: 'auto'
    revisionMode: 'Single'
  }
  executionApi: {
    cpu: 1
    memory: '2Gi'
    minReplicas: 2
    maxReplicas: 10
    targetConcurrency: 50
    externalIngress: true
    targetPort: 3001
    transport: 'auto'
    revisionMode: 'Single'
  }
  mason: {
    cpu: 1
    memory: '2Gi'
    minReplicas: 2
    maxReplicas: 20
    targetConcurrency: 20
    externalIngress: false
    targetPort: 3100
    transport: 'auto'
    revisionMode: 'Single'
  }
  julius: {
    cpu: 1
    memory: '2Gi'
    minReplicas: 1
    maxReplicas: 15
    targetConcurrency: 20
    externalIngress: false
    targetPort: 3200
    transport: 'auto'
    revisionMode: 'Single'
  }
  workerRuntime: {
    cpu: 1
    memory: '2Gi'
    minReplicas: 0
    maxReplicas: 25
    targetConcurrency: 10
    externalIngress: false
    targetPort: 3300
    transport: 'auto'
    revisionMode: 'Single'
  }
  futureRuntime: {
    cpu: 0.5
    memory: '1Gi'
    minReplicas: 0
    maxReplicas: 5
    targetConcurrency: 10
    externalIngress: false
    targetPort: 3400
    transport: 'auto'
    revisionMode: 'Single'
  }
}

@description('Per-service health probe config keyed by service role.')
param healthProbes object = {
  startupPath: '/health/startup'
  readinessPath: '/health/readiness'
  livenessPath: '/health/liveness'
  portFallback: 8080
}

@description('Queue scaler hooks keyed by service role. Values are metadata placeholders and require runtime queue wiring in later epics.')
param queueScaleHooks object = {
  mason: {
    enabled: true
    queueName: 'execution-intents'
    messageCount: '25'
  }
  julius: {
    enabled: true
    queueName: 'execution-validation'
    messageCount: '25'
  }
  workerRuntime: {
    enabled: true
    queueName: 'execution-results'
    messageCount: '50'
  }
}

@description('Enable Dapr sidecar configuration scaffolding. Dapr remains disabled by default per approved architecture posture.')
param daprConfig object = {
  enabled: false
  appProtocol: 'http'
  appPort: 80
}

@description('Optional additional tags applied to compute resources.')
param tags object = {}

module env './modules/container-apps-environment.bicep' = {
  name: 'container-apps-environment'
  params: {
    location: location
    environmentName: containerAppsEnvironmentName
    logAnalyticsWorkspaceResourceId: logAnalyticsWorkspaceResourceId
    tags: union({
      environment: environment
      workload: 'runtime-r1'
      scope: 'compute'
    }, tags)
  }
}

module harmonyApp './modules/container-app-service.bicep' = {
  name: 'container-app-harmony'
  params: {
    containerAppName: '${namePrefix}-harmony'
    containerAppsEnvironmentResourceId: env.outputs.environmentResourceId
    revisionMode: serviceConfig.harmony.revisionMode
    image: containerImages.harmony
    targetPort: serviceConfig.harmony.targetPort
    externalIngress: serviceConfig.harmony.externalIngress
    transport: serviceConfig.harmony.transport
    cpu: serviceConfig.harmony.cpu
    memory: serviceConfig.harmony.memory
    minReplicas: serviceConfig.harmony.minReplicas
    maxReplicas: serviceConfig.harmony.maxReplicas
    targetConcurrency: serviceConfig.harmony.targetConcurrency
    managedIdentityResourceId: managedIdentityResourceIds.harmony
    registryServer: containerRegistryServer
    registryIdentityResourceId: containerRegistryIdentityResourceId
    keyVaultUri: keyVaultUri
    appInsightsConnectionString: appInsightsConnectionString
    startupProbePath: healthProbes.startupPath
    readinessProbePath: healthProbes.readinessPath
    livenessProbePath: healthProbes.livenessPath
    probePort: serviceConfig.harmony.targetPort
    daprEnabled: daprConfig.enabled
    daprAppProtocol: daprConfig.appProtocol
    daprAppPort: serviceConfig.harmony.targetPort
    queueScaleRule: {
      enabled: false
      queueName: ''
      messageCount: ''
    }
    tags: union({
      service: 'harmony'
    }, tags)
  }
}

module executionApiApp './modules/container-app-service.bicep' = {
  name: 'container-app-execution-api'
  params: {
    containerAppName: '${namePrefix}-execution-api'
    containerAppsEnvironmentResourceId: env.outputs.environmentResourceId
    revisionMode: serviceConfig.executionApi.revisionMode
    image: containerImages.executionApi
    targetPort: serviceConfig.executionApi.targetPort
    externalIngress: serviceConfig.executionApi.externalIngress
    transport: serviceConfig.executionApi.transport
    cpu: serviceConfig.executionApi.cpu
    memory: serviceConfig.executionApi.memory
    minReplicas: serviceConfig.executionApi.minReplicas
    maxReplicas: serviceConfig.executionApi.maxReplicas
    targetConcurrency: serviceConfig.executionApi.targetConcurrency
    managedIdentityResourceId: managedIdentityResourceIds.executionApi
    registryServer: containerRegistryServer
    registryIdentityResourceId: containerRegistryIdentityResourceId
    keyVaultUri: keyVaultUri
    appInsightsConnectionString: appInsightsConnectionString
    startupProbePath: healthProbes.startupPath
    readinessProbePath: healthProbes.readinessPath
    livenessProbePath: healthProbes.livenessPath
    probePort: serviceConfig.executionApi.targetPort
    daprEnabled: daprConfig.enabled
    daprAppProtocol: daprConfig.appProtocol
    daprAppPort: serviceConfig.executionApi.targetPort
    queueScaleRule: {
      enabled: false
      queueName: ''
      messageCount: ''
    }
    tags: union({
      service: 'execution-api'
    }, tags)
  }
}

module masonApp './modules/container-app-service.bicep' = {
  name: 'container-app-mason'
  params: {
    containerAppName: '${namePrefix}-mason'
    containerAppsEnvironmentResourceId: env.outputs.environmentResourceId
    revisionMode: serviceConfig.mason.revisionMode
    image: containerImages.mason
    targetPort: serviceConfig.mason.targetPort
    externalIngress: serviceConfig.mason.externalIngress
    transport: serviceConfig.mason.transport
    cpu: serviceConfig.mason.cpu
    memory: serviceConfig.mason.memory
    minReplicas: serviceConfig.mason.minReplicas
    maxReplicas: serviceConfig.mason.maxReplicas
    targetConcurrency: serviceConfig.mason.targetConcurrency
    managedIdentityResourceId: managedIdentityResourceIds.mason
    registryServer: containerRegistryServer
    registryIdentityResourceId: containerRegistryIdentityResourceId
    keyVaultUri: keyVaultUri
    appInsightsConnectionString: appInsightsConnectionString
    startupProbePath: healthProbes.startupPath
    readinessProbePath: healthProbes.readinessPath
    livenessProbePath: healthProbes.livenessPath
    probePort: serviceConfig.mason.targetPort
    daprEnabled: daprConfig.enabled
    daprAppProtocol: daprConfig.appProtocol
    daprAppPort: serviceConfig.mason.targetPort
    queueScaleRule: queueScaleHooks.mason
    tags: union({
      service: 'mason'
    }, tags)
  }
}

module juliusApp './modules/container-app-service.bicep' = {
  name: 'container-app-julius'
  params: {
    containerAppName: '${namePrefix}-julius'
    containerAppsEnvironmentResourceId: env.outputs.environmentResourceId
    revisionMode: serviceConfig.julius.revisionMode
    image: containerImages.julius
    targetPort: serviceConfig.julius.targetPort
    externalIngress: serviceConfig.julius.externalIngress
    transport: serviceConfig.julius.transport
    cpu: serviceConfig.julius.cpu
    memory: serviceConfig.julius.memory
    minReplicas: serviceConfig.julius.minReplicas
    maxReplicas: serviceConfig.julius.maxReplicas
    targetConcurrency: serviceConfig.julius.targetConcurrency
    managedIdentityResourceId: managedIdentityResourceIds.julius
    registryServer: containerRegistryServer
    registryIdentityResourceId: containerRegistryIdentityResourceId
    keyVaultUri: keyVaultUri
    appInsightsConnectionString: appInsightsConnectionString
    startupProbePath: healthProbes.startupPath
    readinessProbePath: healthProbes.readinessPath
    livenessProbePath: healthProbes.livenessPath
    probePort: serviceConfig.julius.targetPort
    daprEnabled: daprConfig.enabled
    daprAppProtocol: daprConfig.appProtocol
    daprAppPort: serviceConfig.julius.targetPort
    queueScaleRule: queueScaleHooks.julius
    tags: union({
      service: 'julius'
    }, tags)
  }
}

module workerRuntimeApp './modules/container-app-service.bicep' = {
  name: 'container-app-worker-runtime'
  params: {
    containerAppName: '${namePrefix}-worker-runtime'
    containerAppsEnvironmentResourceId: env.outputs.environmentResourceId
    revisionMode: serviceConfig.workerRuntime.revisionMode
    image: containerImages.workerRuntime
    targetPort: serviceConfig.workerRuntime.targetPort
    externalIngress: serviceConfig.workerRuntime.externalIngress
    transport: serviceConfig.workerRuntime.transport
    cpu: serviceConfig.workerRuntime.cpu
    memory: serviceConfig.workerRuntime.memory
    minReplicas: serviceConfig.workerRuntime.minReplicas
    maxReplicas: serviceConfig.workerRuntime.maxReplicas
    targetConcurrency: serviceConfig.workerRuntime.targetConcurrency
    managedIdentityResourceId: managedIdentityResourceIds.workerRuntime
    registryServer: containerRegistryServer
    registryIdentityResourceId: containerRegistryIdentityResourceId
    keyVaultUri: keyVaultUri
    appInsightsConnectionString: appInsightsConnectionString
    startupProbePath: healthProbes.startupPath
    readinessProbePath: healthProbes.readinessPath
    livenessProbePath: healthProbes.livenessPath
    probePort: serviceConfig.workerRuntime.targetPort
    daprEnabled: daprConfig.enabled
    daprAppProtocol: daprConfig.appProtocol
    daprAppPort: serviceConfig.workerRuntime.targetPort
    queueScaleRule: queueScaleHooks.workerRuntime
    tags: union({
      service: 'worker-runtime'
    }, tags)
  }
}

module futureRuntimeApp './modules/container-app-service.bicep' = {
  name: 'container-app-future-runtime'
  params: {
    containerAppName: '${namePrefix}-future-runtime'
    containerAppsEnvironmentResourceId: env.outputs.environmentResourceId
    revisionMode: serviceConfig.futureRuntime.revisionMode
    image: containerImages.futureRuntime
    targetPort: serviceConfig.futureRuntime.targetPort
    externalIngress: serviceConfig.futureRuntime.externalIngress
    transport: serviceConfig.futureRuntime.transport
    cpu: serviceConfig.futureRuntime.cpu
    memory: serviceConfig.futureRuntime.memory
    minReplicas: serviceConfig.futureRuntime.minReplicas
    maxReplicas: serviceConfig.futureRuntime.maxReplicas
    targetConcurrency: serviceConfig.futureRuntime.targetConcurrency
    managedIdentityResourceId: managedIdentityResourceIds.futureRuntime
    registryServer: containerRegistryServer
    registryIdentityResourceId: containerRegistryIdentityResourceId
    keyVaultUri: keyVaultUri
    appInsightsConnectionString: appInsightsConnectionString
    startupProbePath: healthProbes.startupPath
    readinessProbePath: healthProbes.readinessPath
    livenessProbePath: healthProbes.livenessPath
    probePort: serviceConfig.futureRuntime.targetPort
    daprEnabled: daprConfig.enabled
    daprAppProtocol: daprConfig.appProtocol
    daprAppPort: serviceConfig.futureRuntime.targetPort
    queueScaleRule: {
      enabled: false
      queueName: ''
      messageCount: ''
    }
    tags: union({
      service: 'future-runtime'
    }, tags)
  }
}

output containerAppsEnvironmentResourceId string = env.outputs.environmentResourceId
output runtimeServiceResourceIds object = {
  harmony: harmonyApp.outputs.containerAppResourceId
  executionApi: executionApiApp.outputs.containerAppResourceId
  mason: masonApp.outputs.containerAppResourceId
  julius: juliusApp.outputs.containerAppResourceId
  workerRuntime: workerRuntimeApp.outputs.containerAppResourceId
  futureRuntime: futureRuntimeApp.outputs.containerAppResourceId
}
output runtimeServiceFqdns object = {
  harmony: harmonyApp.outputs.ingressFqdn
  executionApi: executionApiApp.outputs.ingressFqdn
  mason: masonApp.outputs.ingressFqdn
  julius: juliusApp.outputs.ingressFqdn
  workerRuntime: workerRuntimeApp.outputs.ingressFqdn
  futureRuntime: futureRuntimeApp.outputs.ingressFqdn
}
output deploymentNotes object = {
  message: 'Epic E4 provisions compute topology scaffolding only. Runtime code and business logic are not part of this infrastructure deployment.'
  queueScaleHooksConfigured: {
    mason: queueScaleHooks.mason.enabled
    julius: queueScaleHooks.julius.enabled
    workerRuntime: queueScaleHooks.workerRuntime.enabled
  }
}
