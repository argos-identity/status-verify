"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Header from '@/components/sections/header';
import Footer from '@/components/sections/footer';
import IncidentForm from '@/components/sections/incident-form';
import { storage } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import type { IncidentFormData } from '@/lib/types';

export default function CreateIncidentPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations('incident.create');

  const handleSubmit = async (data: IncidentFormData) => {
    setLoading(true);
    setError(null);

    try {
      // 인증 토큰 설정
      if (session?.accessToken) {
        apiClient.setAuthToken(session.accessToken as string);
      }

      // 백엔드가 요구하는 형식으로 데이터 변환
      const incidentData = {
        title: data.title,
        description: data.description,
        status: data.status || 'investigating', // 사용자 선택값 우선, 기본값 fallback
        severity: data.severity || 'medium', // 기본값: medium
        priority: data.priority || 'P2',    // 기본값: P2 (백엔드와 동일)
        affected_services: data.affected_services || [],
        reporter_id: session?.user?.id || 'system',
        detection_criteria: data.detection_criteria,
        reporter: data.reporter || session?.user?.name || 'Unknown'
      };

      // 실제 API 호출
      const createdIncident = await apiClient.createIncident(incidentData);

      // 자동 저장 데이터 정리
      storage.remove(`incident-form-create-new`);

      // 성공 메시지와 함께 상세 페이지로 이동
      router.push(`/incidents/${createdIncident.id}?created=true`);

    } catch (error: any) {
      console.error('Failed to create incident:', error);

      // 에러 메시지 설정
      if (error.status === 401) {
        setError(t('errors.authenticationRequired'));
        router.push(`/auth/login?callbackUrl=/incidents/create`);
      } else if (error.status === 403) {
        setError(t('errors.permissionDenied'));
      } else if (error.status === 0) {
        setError(t('errors.serverConnectionFailed'));
      } else {
        setError(error.message || t('errors.createFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // 자동 저장된 데이터가 있는 경우 확인
    const hasUnsavedData = storage.get(`incident-form-create-new`, null);
    
    if (hasUnsavedData) {
      const shouldDiscard = confirm(t('confirmations.unsavedChanges'));
      if (!shouldDiscard) return;
      
      // 자동 저장 데이터 정리
      storage.remove(`incident-form-create-new`);
    }
    
    router.back();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  {t('errors.errorOccurred')}
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}

        <IncidentForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={loading}
        />
      </div>

      <Footer />
    </div>
  );
}