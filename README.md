AKS Availability Zones
======================

Running AKS with AZs – Scenario 1 - Node pool spanning AZs
----------------------------------------------------------

```sh
LOCATION=australiaeast
RESOURCE_GROUP=aks-span-az
CLUSTER=aks-span-az
VERSION=1.18.8
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

az aks get-credentials --cluster-name $CLUSTER --resource-group $RESOURCE_GROUP --overwrite-existing
```

Check the nodes are spread across AZs:

```sh
kubectl describe nodes | grep -e Name: -e zone
```

Running AKS with AZs – Scenario 2 - Node pool spanning AZs
----------------------------------------------------------

```sh
LOCATION=australiaeast
RESOURCE_GROUP=aks-per-az
CLUSTER=aks-per-az
VERSION=1.18.8
VM_SIZE=Standard_DS3_v2 # 4 vCPU, 14GiB RAM

az group create --name $RESOURCE_GROUP --location $LOCATION

az aks create \
    --resource-group $RESOURCE_GROUP \
    --name $CLUSTER \
    --generate-ssh-keys \
    --zones 1 2 3 \
    -k $VERSION \
    -s $VM_SIZE \
    --nodepool-name nodepool1 \
    --enable-cluster-autoscaler \
    --min-count 3 \
    --max-count 3 \
    --cluster-autoscaler-profile scale-down-delay-after-add=2m scale-down-unneeded-time=2m balance-similar-node-groups=true

az aks nodepool add \
    --name nodepool2 \
    --cluster-name $CLUSTER \
    --resource-group $RESOURCE_GROUP \
    -s $VM_SIZE \
    -k $VERSION \
    --enable-cluster-autoscaler \
    --os-type Linux \
    --min-count 1 \
    --max-count 2 \
    --node-count 1 \
    --zones 1

az aks nodepool add \
    --name nodepool3 \
    --cluster-name $CLUSTER \
    --resource-group $RESOURCE_GROUP \
    -s $VM_SIZE \
    -k $VERSION \
    --enable-cluster-autoscaler \
    --os-type Linux \
    --min-count 1 \
    --max-count 2 \
    --node-count 1 \
    --zones 2

az aks nodepool add \
    --name nodepool4 \
    --cluster-name $CLUSTER \
    --resource-group $RESOURCE_GROUP \
    -s $VM_SIZE \
    -k $VERSION \
    --enable-cluster-autoscaler \
    --os-type Linux \
    --min-count 1 \
    --max-count 2 \
    --node-count 1 \
    --zones 3

az aks get-credentials --cluster-name $CLUSTER --resource-group $RESOURCE_GROUP --overwrite-existing
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

kubectl delete -f one-constraint.yaml -n topology
```

Volume Binding
--------------

### Scenario 1 - Immediate

```sh
kubectl apply -f pvc1.yaml

pv1=$(kubectl get pvc azure-managed-disk1 -o json | jq -r '.spec.volumeName')
kubectl describe pv $pv1 | grep failure-domain.beta.kubernetes.io/zone

# Update pod1.yaml to use a different zone

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

Service Topology
----------------

```sh
az aks nodepool add \
    --name svctopology \
    --cluster-name $CLUSTER \
    -g $RESOURCE_GROUP \
    -k $VERSION \
    --os-type Linux \
    -c 3 \
    --zones 1 2 3 \
    --labels demo=svctopology

kubectl describe nodes --selector demo=svctopology | grep -e Name: -e zone

kubectl apply -f service-topology/nginx.deploy.yaml
kubectl get pod -o wide --selector app=nginx

kubectl create configmap k6-script --from-file=./service-topology/k6-script.js

# Default svc topology (by default, kube-proxy in userspace mode chooses a backend via a round-robin algorithm)
kubectl apply -f service-topology/nginx.svc.yaml
kubectl apply -f service-topology/loadgen.job.yaml
# kubectl logs -f $(kubectl get pod --selector job-name=loadgen | tail -n1 | cut -f1,1 -d ' ')
watch kubectl get job
kubectl logs $(kubectl get pod --selector job-name=loadgen | tail -n1 | cut -f1,1 -d ' ')
kubectl delete job loadgen

# Hostname svc topology
kubectl apply -f service-topology/nginx.svc.hostname.yaml
kubectl apply -f service-topology/loadgen.job.yaml
# kubectl logs -f $(kubectl get pod --selector job-name=loadgen | tail -n1 | cut -f1,1 -d ' ')
watch kubectl get job
kubectl logs $(kubectl get pod --selector job-name=loadgen | tail -n1 | cut -f1,1 -d ' ')
kubectl delete job loadgen

# Zone svc topology
kubectl apply -f service-topology/nginx.svc.zone.yaml
kubectl apply -f service-topology/loadgen.job.yaml
# kubectl logs -f $(kubectl get pod --selector job-name=loadgen | tail -n1 | cut -f1,1 -d ' ')
watch kubectl get job
kubectl logs $(kubectl get pod --selector job-name=loadgen | tail -n1 | cut -f1,1 -d ' ')
kubectl delete job loadgen
```

Example k6 output:

* Default service topology

```sh
✓ status was 200

    checks.....................: 100.00% ✓ 1032366 ✗ 0
    data_received..............: 878 MB  4.9 MB/s
    data_sent..................: 73 MB   407 kB/s
    http_req_blocked...........: avg=409.93µs min=600ns    med=1.5µs   max=243.04ms p(90)=2.9µs   p(95)=6µs
    http_req_connecting........: avg=404.56µs min=0s       med=0s      max=242.97ms p(90)=0s      p(95)=0s
    http_req_duration..........: avg=38.96ms  min=109.71µs med=33.44ms max=366.24ms p(90)=80.93ms p(95)=98.68ms
    http_req_receiving.........: avg=383.15µs min=10.6µs   med=23.9µs  max=179.75ms p(90)=69.4µs  p(95)=184.61µs
    http_req_sending...........: avg=173.86µs min=3.7µs    med=7.5µs   max=125.2ms  p(90)=19.2µs  p(95)=41.7µs
    http_req_tls_handshaking...: avg=0s       min=0s       med=0s      max=0s       p(90)=0s      p(95)=0s
    http_req_waiting...........: avg=38.41ms  min=58.3µs   med=33.02ms max=365.53ms p(90)=79.69ms p(95)=96.97ms
    http_reqs..................: 1032366 5733.971363/s
    iteration_duration.........: avg=39.91ms  min=151.51µs med=34.03ms max=526.68ms p(90)=82.8ms  p(95)=101.92ms
    iterations.................: 1032366 5733.971363/s
    vus........................: 1       min=1     max=499
    vus_max....................: 500     min=500   max=500
```

* Hostname service topology

```sh
✓ status was 200

    checks.....................: 100.00% ✓ 1040530 ✗ 0
    data_received..............: 884 MB  4.9 MB/s
    data_sent..................: 74 MB   410 kB/s
    http_req_blocked...........: avg=408.18µs min=700ns    med=1.5µs   max=1.02s    p(90)=2.9µs   p(95)=6µs
    http_req_connecting........: avg=403µs    min=0s       med=0s      max=1.02s    p(90)=0s      p(95)=0s
    http_req_duration..........: avg=38.63ms  min=113.41µs med=33.06ms max=392.08ms p(90)=80.93ms p(95)=97.39ms
    http_req_receiving.........: avg=383.95µs min=10.4µs   med=23.7µs  max=141.79ms p(90)=68.6µs  p(95)=182.71µs
    http_req_sending...........: avg=174.62µs min=3.8µs    med=7.5µs   max=253.29ms p(90)=19.1µs  p(95)=41.2µs
    http_req_tls_handshaking...: avg=0s       min=0s       med=0s      max=0s       p(90)=0s      p(95)=0s
    http_req_waiting...........: avg=38.07ms  min=81.8µs   med=32.63ms max=293.74ms p(90)=79.69ms p(95)=95.74ms
    http_reqs..................: 1040530 5778.789175/s
    iteration_duration.........: avg=39.59ms  min=155.21µs med=33.62ms max=1.02s    p(90)=82.85ms p(95)=100.56ms
    iterations.................: 1040530 5778.789175/s
    vus........................: 1       min=1     max=499
    vus_max....................: 500     min=500   max=500
```

* Zone service topology

```sh
✓ status was 200

    checks.....................: 100.00% ✓ 1037978 ✗ 0
    data_received..............: 882 MB  4.9 MB/s
    data_sent..................: 74 MB   409 kB/s
    http_req_blocked...........: avg=407.95µs min=700ns    med=1.5µs   max=244.34ms p(90)=2.9µs   p(95)=6µs
    http_req_connecting........: avg=402.69µs min=0s       med=0s      max=244.29ms p(90)=0s      p(95)=0s
    http_req_duration..........: avg=38.71ms  min=110.4µs  med=33.02ms max=322.25ms p(90)=80.31ms p(95)=97.61ms
    http_req_receiving.........: avg=382.95µs min=9.6µs    med=23.7µs  max=135.15ms p(90)=69µs    p(95)=180.51µs
    http_req_sending...........: avg=173.46µs min=3.8µs    med=7.6µs   max=203.49ms p(90)=19.3µs  p(95)=41.8µs
    http_req_tls_handshaking...: avg=0s       min=0s       med=0s      max=0s       p(90)=0s      p(95)=0s
    http_req_waiting...........: avg=38.15ms  min=83.9µs   med=32.59ms max=264.37ms p(90)=79.04ms p(95)=95.88ms
    http_reqs..................: 1037978 5765.130352/s
    iteration_duration.........: avg=39.69ms  min=150.61µs med=33.65ms max=435.47ms p(90)=82.17ms p(95)=100.79ms
    iterations.................: 1037978 5765.130352/s
    vus........................: 1       min=1     max=499
    vus_max....................: 500     min=500   max=500
```

Add a proximity placement group node pool:

```sh
PPG_NAME=aks-ppg-1

az feature register --namespace "Microsoft.ContainerService" --name "ProximityPlacementGroupPreview"

# Verify the feature is registered:
az feature list -o table --query "[?contains(name, 'Microsoft.ContainerService/ProximityPlacementGroupPreview')].{Name:name,State:properties.state}"
az extension update --name aks-preview

az ppg create -n $PPG_NAME -g $RESOURCE_GROUP -l $LOCATION -t standard
PPG_ID=$(az ppg show -n $PPG_NAME -g $RESOURCE_GROUP --query id -o tsv)

az aks nodepool add \
    --name ppgtopology \
    --cluster-name $CLUSTER \
    -g $RESOURCE_GROUP \
    -k $VERSION \
    --os-type Linux \
    -c 3 \
    --zones 1 \
    --labels demo=ppgtopology \
    --ppg $PPG_ID

kubectl describe nodes --selector demo=ppgtopology | grep -e Name: -e zone

# Zone+PPG svc topology
kubectl delete job loadgen
kubectl delete deploy nginx
kubectl delete svc nginx

kubectl apply -f service-topology/ppg/nginx.deploy.yaml
kubectl get pod -o wide --selector app=nginx

kubectl apply -f service-topology/ppg/nginx.svc.zone.yaml
kubectl apply -f service-topology/ppg/loadgen.job.yaml
# kubectl logs -f $(kubectl get pod --selector job-name=loadgen | tail -n1 | cut -f1,1 -d ' ')
watch kubectl get job
kubectl logs $(kubectl get pod --selector job-name=loadgen | tail -n1 | cut -f1,1 -d ' ')
kubectl delete job loadgen
```

Example k6 output:

* Zone+PPG service topology

```sh
✓ status was 200

    checks.....................: 100.00% ✓ 1099405 ✗ 0
    data_received..............: 934 MB  5.2 MB/s
    data_sent..................: 78 MB   434 kB/s
    http_req_blocked...........: avg=384.95µs min=600ns   med=1.4µs   max=245.94ms p(90)=2.9µs   p(95)=6.2µs
    http_req_connecting........: avg=379.91µs min=0s      med=0s      max=245.88ms p(90)=0s      p(95)=0s
    http_req_duration..........: avg=36.58ms  min=106.1µs med=31.37ms max=328.38ms p(90)=76.81ms p(95)=94.28ms
    http_req_receiving.........: avg=365.07µs min=9.3µs   med=23.7µs  max=216.28ms p(90)=64.4µs  p(95)=184.41µs
    http_req_sending...........: avg=163.24µs min=3.4µs   med=7.5µs   max=127.23ms p(90)=21.4µs  p(95)=41.3µs
    http_req_tls_handshaking...: avg=0s       min=0s      med=0s      max=0s       p(90)=0s      p(95)=0s
    http_req_waiting...........: avg=36.05ms  min=74.6µs  med=30.97ms max=295.81ms p(90)=75.7ms  p(95)=92.68ms
    http_reqs..................: 1099405 6105.424487/s
    iteration_duration.........: avg=37.47ms  min=146.2µs med=31.89ms max=396.96ms p(90)=78.56ms p(95)=97.31ms
    iterations.................: 1099405 6105.424487/s
    vus........................: 1       min=1     max=499
    vus_max....................: 500     min=500   max=500
```

Cleanup:

```sh
kubectl delete job loadgen
kubectl delete deploy nginx
kubectl delete svc nginx

az aks nodepool delete \
    --name svctopology \
    --cluster-name $CLUSTER \
    -g $RESOURCE_GROUP

az aks nodepool delete \
    --name ppgtopology \
    --cluster-name $CLUSTER \
    -g $RESOURCE_GROUP

az ppg delete -n $PPG_NAME -g $RESOURCE_GROUP
```

TODO
----

As the results show, there isn't a lot of difference with the various service topologies.
To create a more realistic scenario, have more east-west traffic (chained calls) and other background traffic going on.

References
----------

* https://kubernetes.io/docs/concepts/services-networking/service
* https://docs.microsoft.com/en-us/azure/aks/reduce-latency-ppg
