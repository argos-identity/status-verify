"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
  Save,
  X,
  Loader2,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/sections/header';
import Footer from '@/components/sections/footer';
import IncidentTimeline from '@/components/sections/incident-timeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useIncident } from '@/hooks/use-incidents';
import apiClient from '@/lib/api-client';
import type { Incident, IncidentStatus, IncidentPriority, IncidentSeverity } from '@/lib/types';
import { formatServiceName } from '@/lib/utils';

export default function IncidentEditPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const incidentId = params.id as string;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load incident data
  const {
    incident: originalIncident,
    updates,
    loading,
    error: loadError,
    refresh
  } = useIncident(incidentId);

  // Form state
  const [formData, setFormData] = useState<Partial<Incident>>({});

  // Initialize form data when incident loads
  useEffect(() => {
    if (originalIncident) {
      setFormData({
        title: originalIncident.title,
        description: originalIncident.description,
        status: originalIncident.status,
        priority: originalIncident.priority,
        severity: originalIncident.severity,
        affected_services: originalIncident.affected_services,
        detection_criteria: originalIncident.detection_criteria,
        reporter: originalIncident.reporter
      });
    }
  }, [originalIncident]);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/login?callbackUrl=/incidents/${incidentId}/edit`);
    }
  }, [status, router, incidentId]);

  // Show loading while checking auth or loading incident
  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>로딩 중...</span>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Show error if incident not found or load error
  if (loadError || !originalIncident) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {loadError || `해당 장애 이벤트를 찾을 수 없습니다. (ID: ${incidentId})`}
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex items-center gap-2">
            <Link href="/incidents">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                목록으로 돌아가기
              </Button>
            </Link>
            <Button variant="outline" onClick={refresh}>
              <Loader2 className="w-4 h-4 mr-2" />
              다시 시도
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const handleSave = async () => {
    if (!formData.title?.trim()) {
      setError('제목을 입력해주세요.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 인증 토큰 설정
      if (session?.accessToken) {
        apiClient.setAuthToken(session.accessToken as string);
      }

      // 백엔드가 요구하는 형식으로 데이터 변환
      const updateData = {
        title: formData.title,
        description: formData.description,
        status: formData.status,
        severity: formData.severity,
        priority: formData.priority,
        affected_services: formData.affected_services || [],
        detection_criteria: formData.detection_criteria,
        reporter: formData.reporter
      };

      // 실제 API 호출
      const updatedIncident = await apiClient.updateIncident(incidentId, updateData);

      console.log('Updated incident:', updatedIncident);

      // 성공 메시지와 함께 상세 페이지로 이동 (쿼리 파라미터 제거)
      router.push(`/incidents/${incidentId}`);

    } catch (err: any) {
      console.error('Failed to save incident:', err);

      // 에러 메시지 설정
      if (err.status === 401) {
        setError('인증이 필요합니다. 로그인 후 다시 시도해주세요.');
        router.push(`/auth/login?callbackUrl=/incidents/${incidentId}/edit`);
      } else if (err.status === 403) {
        setError('인시던트 수정 권한이 없습니다.');
      } else if (err.status === 404) {
        setError('해당 인시던트를 찾을 수 없습니다.');
      } else if (err.status === 0) {
        setError('서버에 연결할 수 없습니다. 백엔드 API 서버가 실행 중인지 확인해주세요.');
      } else {
        setError(err.message || '장애 이벤트 저장에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmDelete = confirm('정말로 이 장애 이벤트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.');
    if (!confirmDelete) return;

    try {
      // 인증 토큰 설정
      if (session?.accessToken) {
        apiClient.setAuthToken(session.accessToken as string);
      }

      // 삭제 API 호출
      await apiClient.deleteIncident(incidentId);

      console.log('Incident deleted successfully');

      // 목록 페이지로 이동
      router.push('/incidents');

    } catch (err: any) {
      console.error('Failed to delete incident:', err);

      // 에러 메시지 설정
      if (err.status === 401) {
        setError('인증이 필요합니다. 로그인 후 다시 시도해주세요.');
      } else if (err.status === 403) {
        setError('인시던트 삭제 권한이 없습니다.');
      } else if (err.status === 404) {
        setError('해당 인시던트를 찾을 수 없습니다.');
      } else if (err.status === 0) {
        setError('서버에 연결할 수 없습니다. 백엔드 API 서버가 실행 중인지 확인해주세요.');
      } else {
        setError(err.message || '장애 이벤트 삭제에 실패했습니다. 다시 시도해주세요.');
      }
    }
  };

  const handleAddUpdate = async (updateData: { status: IncidentStatus; description: string }) => {
    try {
      // 인증 토큰 설정
      if (session?.accessToken) {
        apiClient.setAuthToken(session.accessToken as string);
      }

      // API 호출로 업데이트 추가
      await apiClient.addIncidentUpdate(incidentId, {
        status: updateData.status,
        description: updateData.description,
      });

      // 데이터 새로고침
      await refresh();

      console.log('Update added successfully:', updateData);
    } catch (error) {
      console.error('Failed to add update:', error);
      alert('업데이트 추가에 실패했습니다.');
    }
  };

  const handleFieldChange = (field: keyof Incident, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleServiceToggle = (service: string) => {
    const currentServices = formData.affected_services || [];
    const newServices = currentServices.includes(service)
      ? currentServices.filter(s => s !== service)
      : [...currentServices, service];

    handleFieldChange('affected_services', newServices);
  };

  const availableServices = [
    'id-recognition',
    'face-liveness',
    'id-liveness',
    'face-compare',
    'curp-verifier'
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href={`/incidents/${incidentId}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                뒤로
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {incidentId}
                </Badge>
                <span className="text-xs text-muted-foreground">편집 모드</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                장애 이벤트 수정
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              삭제
            </Button>
            <Link href={`/incidents/${incidentId}`}>
              <Button variant="outline" size="sm">
                <X className="w-4 h-4 mr-2" />
                취소
              </Button>
            </Link>
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              저장
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Form */}
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">제목 *</label>
                <Input
                  value={formData.title || ''}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  placeholder="장애 이벤트 제목을 입력하세요"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">설명</label>
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  placeholder="장애 상황에 대한 상세한 설명을 입력하세요"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">발생 기준 / 감지 방법</label>
                <Textarea
                  value={formData.detection_criteria || ''}
                  onChange={(e) => handleFieldChange('detection_criteria', e.target.value)}
                  placeholder="장애 감지 기준이나 방법을 입력하세요"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">보고자</label>
                <Input
                  value={formData.reporter || ''}
                  onChange={(e) => handleFieldChange('reporter', e.target.value)}
                  placeholder="보고자 이름을 입력하세요"
                />
              </div>
            </CardContent>
          </Card>

          {/* Status and Priority */}
          <Card>
            <CardHeader>
              <CardTitle>상태 및 우선순위</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">상태</label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => handleFieldChange('status', value as IncidentStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="상태 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investigating">조사 중</SelectItem>
                      <SelectItem value="identified">원인 식별</SelectItem>
                      <SelectItem value="monitoring">모니터링</SelectItem>
                      <SelectItem value="resolved">해결됨</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">우선순위</label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => handleFieldChange('priority', value as IncidentPriority)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="우선순위 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="P1">P1 - Critical</SelectItem>
                      <SelectItem value="P2">P2 - High</SelectItem>
                      <SelectItem value="P3">P3 - Medium</SelectItem>
                      <SelectItem value="P4">P4 - Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">심각도</label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value) => handleFieldChange('severity', value as IncidentSeverity)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="심각도 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">치명적</SelectItem>
                      <SelectItem value="high">높음</SelectItem>
                      <SelectItem value="medium">중간</SelectItem>
                      <SelectItem value="low">낮음</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Affected Services */}
          <Card>
            <CardHeader>
              <CardTitle>영향받는 서비스</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  영향을 받는 서비스를 선택하세요 (복수 선택 가능)
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {availableServices.map((service) => (
                    <label
                      key={service}
                      className="flex items-center space-x-2 cursor-pointer p-2 rounded border hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={formData.affected_services?.includes(service) || false}
                        onChange={() => handleServiceToggle(service)}
                        className="rounded border-border"
                      />
                      <span className="text-sm">{formatServiceName(service)}</span>
                    </label>
                  ))}
                </div>
                {formData.affected_services && formData.affected_services.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">선택된 서비스:</span>
                    {formData.affected_services.map((service) => (
                      <Badge key={service} variant="outline">
                        {formatServiceName(service)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Update History Timeline */}
          {originalIncident && (
            <div className="mt-8">
              <IncidentTimeline
                incidentId={incidentId}
                updates={updates || []}
                currentStatus={originalIncident.status}
                onAddUpdate={handleAddUpdate}
                canEdit={originalIncident.status !== 'resolved'}
              />
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}