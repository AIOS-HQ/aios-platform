targetScope = 'resourceGroup'

param actionGroupName string
param shortName string
param location string
param tags object
param emailReceivers array
param webhookReceivers array

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: location
  tags: tags
  properties: {
    groupShortName: shortName
    enabled: true
    emailReceivers: [for receiver in emailReceivers: {
      name: receiver.name
      emailAddress: receiver.emailAddress
      useCommonAlertSchema: true
    }]
    webhookReceivers: [for receiver in webhookReceivers: {
      name: receiver.name
      serviceUri: receiver.serviceUri
      useCommonAlertSchema: true
    }]
  }
}

output actionGroupResourceId string = actionGroup.id
