'use client';

import { SWRConfig } from 'swr';
import { ReactNode } from 'react';

interface SWRProviderProps {
  children: ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        // No global fetcher - let hooks define their own
        refreshInterval: 0, // Disable global refresh, let hooks handle it
        revalidateOnFocus: true, // 포커스 시 재검증 활성화
        revalidateOnReconnect: true, // 재연결 시 재검증
        revalidateIfStale: true, // 오래된 데이터 재검증
        errorRetryCount: 3, // 오류 시 3번 재시도
        errorRetryInterval: 1000, // 1초 간격으로 재시도
        dedupingInterval: 2000, // 중복 요청 방지 (2초)
        focusThrottleInterval: 5000, // 포커스 재검증 간격 (5초)
        onError: (error, key) => {
          console.error('SWR Error:', { key, error: error.message });
        },
        onSuccess: (data, key) => {
          console.log('SWR Success:', { key, hasData: !!data });
        }
      }}
    >
      {children}
    </SWRConfig>
  );
}