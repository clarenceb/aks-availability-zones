AKS Availability Zones
======================

Running AKS with AZs – Scenario 1 - Node pool spanning AZs
----------------------------------------------------------

```sh
LOCATION=australiaeast
RESOURCE_GROUP=aks-span-az
CLUSTER=aks-span-az
VERSION=1.17.9
VM_SIZE=Standard_DS3_v2 # 4 vCPU, 14GiB RAM

az group create --name $RESOURCE_GROUP --location $LOCATION

az aks create \
    --resource-group $RESOURCE_GROUP \
    --name $CLUSTER \
    --generate-ssh-keys \
    --vm-set-type VirtualMachineScaleSets \
    --load-balancer-sku standard \
    -k $VERSION \
    -s $VM_SIZE \
    --nodepool-name nodepool1 \
    --zones 1 2 3 \
    --enable-cluster-autoscaler \
    --min-count 3 \
    --max-count 3 \
    --cluster-autoscaler-profile scale-down-delay-after-add=2m scale-down-unneeded-time=2m

az aks nodepool add \
    --name nodepool2 \
    --cluster-name $CLUSTER \
    --resource-group $RESOURCE_GROUP \
    -s $VM_SIZE \
    -k $VERSION \
    --enable-cluster-autoscaler \
    --os-type Linux \
    --min-count 3 \
    --max-count 6 \
    --zones 1 2 3
```

Check the nodes are spread across AZs:

```sh
kubectl describe nodes | grep -e Name: -e zone
```

Pod Topology Aware Scheduling
-----------------------------

```sh
kubectl create ns topology

kubectl apply -f one-constraint.yaml -n topology
kubectl get pod -n topology -o wide

kubectl scale deployment mydeploy --replicas=3 -n topology
kubectl get pod -n topology -o wide

kubectl scale deployment mydeploy --replicas=5 -n topology
kubectl get pod -n topology -o wide

kubectl scale deployment mydeploy --replicas=6 -n topology
kubectl get pod -n topology -o wide

# Cleanup
kubectl delete -f one-constraint.yaml -n topology
```

Volume Binding Aware Scheduling
-------------------------------

### Scenario 1 - Immediate

```sh
kubectl apply -f pvc1.yaml

pv1=$(kubectl get pvc azure-managed-disk1 -o json | jq -r '.spec.volumeName')
kubectl describe pv $pv1 | grep failure-domain.beta.kubernetes.io/zone

# Update pod1.yaml to use a different zone to the PVC
kubectl apply -f pod1.yaml

kubectl get pod mypod1 -w

kubectl describe pod mypod1
# Observe pod will not be scheduled.
```

Cleanup:

```sh
kubectl delete -f pod1.yaml
kubectl delete -f pvc1.yaml
```

### Scenario 2 - WaitForFirstConsumer

```sh
kubectl apply -f sc2.yaml
kubectl get sc

kubectl apply -f pvc2.yaml
kubectl get pvc
# See the pvc is pending

kubectl apply -f pod2.yaml
kubectl describe pod mypod2
kubectl describe pvc azure-managed-disk2

kubectl get pod mypod2
# Observe pod will be scheduled.

node=$(kubectl get pod mypod2 -o json | jq -r '.spec.nodeName')
kubectl describe node $node | grep zone

pv2=$(kubectl get pvc azure-managed-disk2 -o json | jq -r '.spec.volumeName')
kubectl describe pv $pv2 | grep failure-domain.beta.kubernetes.io/zone

# Observe pod and pv are created in the same zone
```

Cleanup:

```sh
kubectl delete -f pod2.yaml
kubectl delete -f pvc2.yaml
```
