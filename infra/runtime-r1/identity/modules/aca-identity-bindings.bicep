targetScope = 'resourceGroup'

@description('Container App resource IDs keyed by runtime service role. These apps are not modified by this module.')
param containerAppResourceIds object = {}

@description('Managed identity resource IDs keyed by runtime service role.')
param identityResourceIds object

var knownRoles = [
  'harmony'
  'executionApi'
  'mason'
  'julius'
  'workerRuntime'
  'futureRuntime'
]

var bindingPlan = {
  harmony: {
    containerAppResourceId: contains(containerAppResourceIds, 'harmony') ? string(containerAppResourceIds.harmony) : ''
    managedIdentityResourceId: string(identityResourceIds.harmony)
  }
  executionApi: {
    containerAppResourceId: contains(containerAppResourceIds, 'executionApi') ? string(containerAppResourceIds.executionApi) : ''
    managedIdentityResourceId: string(identityResourceIds.executionApi)
  }
  mason: {
    containerAppResourceId: contains(containerAppResourceIds, 'mason') ? string(containerAppResourceIds.mason) : ''
    managedIdentityResourceId: string(identityResourceIds.mason)
  }
  julius: {
    containerAppResourceId: contains(containerAppResourceIds, 'julius') ? string(containerAppResourceIds.julius) : ''
    managedIdentityResourceId: string(identityResourceIds.julius)
  }
  workerRuntime: {
    containerAppResourceId: contains(containerAppResourceIds, 'workerRuntime') ? string(containerAppResourceIds.workerRuntime) : ''
    managedIdentityResourceId: string(identityResourceIds.workerRuntime)
  }
  futureRuntime: {
    containerAppResourceId: contains(containerAppResourceIds, 'futureRuntime') ? string(containerAppResourceIds.futureRuntime) : ''
    managedIdentityResourceId: string(identityResourceIds.futureRuntime)
  }
}

output bindingPlan object = bindingPlan
output notes string = 'Use bindingPlan outputs to patch existing Container Apps with userAssignedIdentities in Epic E4. This module intentionally does not deploy Container Apps.'
