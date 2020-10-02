import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '2m', target: 500 },
    { duration: '30s', target: 0 },
  ],
};

export default function() {
  let res = http.get('http://nginx/');
  check(res, { 'status was 200': r => r.status == 200 });
}
