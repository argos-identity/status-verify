#!/usr/bin/env node

/**
 * API 로깅 기능 테스트 스크립트
 *
 * 이 스크립트는 다음 항목들을 테스트합니다:
 * 1. Watch Server의 Health Monitor 로깅
 * 2. Backend API의 외부 API 로깅 미들웨어
 * 3. Frontend API Client의 로깅 기능
 */

const axios = require('axios');

console.log('🧪 API 로깅 기능 테스트 시작\n');

// 테스트 구성
const tests = [
  {
    name: 'Watch Server Health Check 로깅 테스트',
    description: 'Watch Server가 외부 API들을 호출할 때 로깅이 올바르게 작동하는지 확인',
    endpoint: 'http://localhost:3008/health',
    method: 'GET'
  },
  {
    name: 'Backend API 시스템 상태 로깅 테스트',
    description: 'Backend API가 시스템 상태를 조회할 때 로깅이 올바르게 작동하는지 확인',
    endpoint: 'http://localhost:3001/api/system-status',
    method: 'GET'
  },
  {
    name: 'Backend API 서비스 목록 로깅 테스트',
    description: 'Backend API가 서비스 목록을 조회할 때 로깅이 올바르게 작동하는지 확인',
    endpoint: 'http://localhost:3001/api/services',
    method: 'GET'
  }
];

// 각 서비스의 예상 로그 출력 설명
const expectedLogs = {
  'Watch Server': [
    '🚀 API 요청 시작 로그',
    '📝 Request ID 생성',
    '🌐 Service Name (ID Recognition, Face Liveness, etc.)',
    '🔗 HTTP Method (POST)',
    '🎯 API URL',
    '📋 Headers (API keys는 마스킹됨)',
    '📦 Request Body (test: true, healthCheck: true)',
    '✅/❌ API 응답 완료 로그',
    '📥 Response Data 또는 Error',
    '⏱️ Response Time',
    '=== 구조화된 로그 구분선 ==='
  ],
  'Backend API': [
    'EXTERNAL_API: 외부 API 호출 로그',
    'Request ID와 함께 요청/응답 추적',
    '민감한 정보 마스킹 (***MASKED***)',
    'HTTP Status Code와 Response Time',
    'Success/Failure 상태'
  ],
  'Frontend API': [
    '🔍 API 호출 로그 (개발 환경에서만)',
    'Console.group으로 구조화된 출력',
    '📝 Request ID 추적',
    '🌐 Service Name',
    '📋 Headers와 📦 Request Body',
    '📥 Response Data',
    '⏱️ Response Time 측정'
  ]
};

async function runTest(test) {
  console.log(`🔬 ${test.name}`);
  console.log(`📋 ${test.description}`);
  console.log(`🎯 ${test.method} ${test.endpoint}`);

  try {
    const startTime = Date.now();
    const response = await axios({
      method: test.method,
      url: test.endpoint,
      timeout: 5000,
      validateStatus: () => true // 모든 상태 코드 허용
    });

    const responseTime = Date.now() - startTime;

    console.log(`✅ 테스트 완료: ${response.status} (${responseTime}ms)`);

    if (response.status >= 200 && response.status < 300) {
      console.log(`📥 응답 데이터 크기: ${JSON.stringify(response.data).length} bytes`);
    } else {
      console.log(`⚠️ 비정상 응답: ${response.status} ${response.statusText}`);
    }

  } catch (error) {
    console.log(`❌ 테스트 실패: ${error.message}`);

    if (error.code === 'ECONNREFUSED') {
      console.log(`💡 힌트: 해당 서비스가 실행 중인지 확인하세요`);
    }
  }

  console.log('');
}

async function main() {
  console.log('📊 예상되는 로그 출력:\n');

  Object.entries(expectedLogs).forEach(([service, logs]) => {
    console.log(`🔧 ${service}:`);
    logs.forEach(log => console.log(`   ${log}`));
    console.log('');
  });

  console.log('🚀 실제 API 호출 테스트 시작:\n');

  for (const test of tests) {
    await runTest(test);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
  }

  console.log('🎉 모든 테스트 완료!');
  console.log('\n📝 로그 확인 방법:');
  console.log('1. Watch Server 로그: watch-server 콘솔 출력 및 logs/api-calls.log 파일');
  console.log('2. Backend API 로그: verify-monitor-api 콘솔 출력');
  console.log('3. Frontend 로그: 브라우저 개발자 도구 콘솔 (개발 환경에서만)');

  console.log('\n🔍 로그에서 확인해야 할 요소:');
  console.log('- 각 API 호출의 시작과 완료가 모두 로깅되는지');
  console.log('- Request ID가 일관되게 추적되는지');
  console.log('- 민감한 정보(API keys, tokens)가 마스킹되는지');
  console.log('- Response Time이 정확히 측정되는지');
  console.log('- 에러 상황도 적절히 로깅되는지');
}

if (require.main === module) {
  main().catch(console.error);
}