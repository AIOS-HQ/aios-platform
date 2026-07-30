targetScope = 'resourceGroup'

@description('Azure region for namespace.')
param location string

@description('Service Bus namespace name.')
param namespaceName string

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param skuName string

@minValue(0)
@maxValue(16)
param premiumMessagingUnits int = 0

@description('Tags applied to namespace.')
param tags object = {}

resource namespace 'Microsoft.ServiceBus/namespaces@2023-01-01-preview' = {
  name: namespaceName
  location: location
  sku: {
    name: skuName
    tier: skuName
    capacity: skuName == 'Premium' ? premiumMessagingUnits : null
  }
  tags: tags
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
    zoneRedundant: skuName == 'Premium'
  }
}

output namespaceName string = namespace.name
output namespaceResourceId string = namespace.id
