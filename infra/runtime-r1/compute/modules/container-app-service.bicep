targetScope = 'resourceGroup'

param containerAppName string
param containerAppsEnvironmentResourceId string
param revisionMode string
param image string
param targetPort int
param externalIngress bool
param transport string
param cpu int
param memory string
param minReplicas int
param maxReplicas int
param targetConcurrency int
param managedIdentityResourceId string
param registryServer string
param registryIdentityResourceId string
param keyVaultUri string
param appInsightsConnectionString string
param startupProbePath string
param readinessProbePath string
param livenessProbePath string
param probePort int
param daprEnabled bool
param daprAppProtocol string
param daprAppPort int
param queueScaleRule object
param tags object

var identityMap = {
  '${managedIdentityResourceId}': {}
}

var appSecrets = [
  {
    name: 'key-vault-uri'
    value: keyVaultUri
  }
  {
    name: 'app-insights-connection-string'
    value: appInsightsConnectionString
  }
]

var scaleRules = concat(
  [
    {
      name: 'http-concurrency'
      http: {
        metadata: {
          concurrentRequests: string(targetConcurrency)
        }
      }
    }
  ],
  queueScaleRule.enabled ? [
    {
      name: 'queue-${queueScaleRule.queueName}'
      custom: {
        type: 'azure-servicebus'
        metadata: {
          queueName: queueScaleRule.queueName
          messageCount: queueScaleRule.messageCount
        }
        auth: []
      }
    }
  ] : []
)

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: resourceGroup().location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: identityMap
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentResourceId
    configuration: {
      ingress: {
        external: externalIngress
        targetPort: targetPort
        transport: transport
        allowInsecure: false
      }
      activeRevisionsMode: revisionMode
      registries: [
        {
          server: registryServer
          identity: empty(registryIdentityResourceId) ? managedIdentityResourceId : registryIdentityResourceId
        }
      ]
      secrets: appSecrets
      dapr: daprEnabled ? {
        enabled: true
        appId: containerAppName
        appPort: daprAppPort
        appProtocol: daprAppProtocol
      } : null
    }
    template: {
      containers: [
        {
          name: 'main'
          image: image
          resources: {
            cpu: cpu
            memory: memory
          }
          env: [
            {
              name: 'APPINSIGHTS_CONNECTION_STRING'
              secretRef: 'app-insights-connection-string'
            }
            {
              name: 'RUNTIME_KEY_VAULT_URI'
              secretRef: 'key-vault-uri'
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: startupProbePath
                port: probePort
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 12
            }
            {
              type: 'Readiness'
              httpGet: {
                path: readinessProbePath
                port: probePort
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
            {
              type: 'Liveness'
              httpGet: {
                path: livenessProbePath
                port: probePort
              }
              initialDelaySeconds: 20
              periodSeconds: 15
              timeoutSeconds: 5
              failureThreshold: 4
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: scaleRules
      }
    }
  }
}

output containerAppResourceId string = app.id
output ingressFqdn string = contains(app.properties.configuration.ingress, 'fqdn') ? app.properties.configuration.ingress.fqdn : ''
