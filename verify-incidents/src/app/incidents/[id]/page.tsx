"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Share2,
  Clock,
  User,
  Server,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/sections/header';
import Footer from '@/components/sections/footer';
import IncidentTimeline from '@/components/sections/incident-timeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useIncident } from '@/hooks/use-incidents';
import { useAuth } from '@/hooks/use-auth';
import apiClient from '@/lib/api-client';
import {
  formatDate,
  formatRelativeTime,
  calculateResolutionTime,
  formatServiceName
} from '@/lib/utils';
import { STATUS_INFO, PRIORITY_INFO, SEVERITY_INFO } from '@/lib/types';
import type { IncidentStatus } from '@/lib/types';

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [updateLoading, setUpdateLoading] = useState(false);

  const incidentId = params.id as string;
  const isNewlyCreated = searchParams.get('created') === 'true';

  // Use API hook instead of mock data
  const {
    incident,
    updates,
    loading,
    error,
    refresh
  } = useIncident(incidentId);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>장애 이벤트 정보를 불러오는 중...</span>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Error or not found state
  if (error || !incident) {
    const isPermissionError = error && (error.includes('Permission denied') || error.includes('Required permission'));
    const errorMessage = error || `해당 장애 이벤트를 찾을 수 없습니다. (ID: ${incidentId})`;

    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Alert variant={isPermissionError ? "default" : "destructive"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {errorMessage}
              {isPermissionError && (
                <div className="mt-2">
                  <Link href="/auth/login">
                    <Button size="sm" variant="outline">
                      로그인하러 가기
                    </Button>
                  </Link>
                </div>
              )}
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex items-center gap-2">
            <Link href="/incidents">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                목록으로 돌아가기
              </Button>
            </Link>
            {!isPermissionError && (
              <Button variant="outline" onClick={refresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                다시 시도
              </Button>
            )}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const resolutionTime = calculateResolutionTime(incident.created_at, incident.resolved_at || undefined);
  const statusInfo = STATUS_INFO[incident.status];
  const priorityInfo = PRIORITY_INFO[incident.priority];
  const severityInfo = SEVERITY_INFO[incident.severity];

  const handleAddUpdate = async (updateData: { status: IncidentStatus; description: string }) => {
    setUpdateLoading(true);

    try {
      // Make API call to add incident update
      await apiClient.addIncidentUpdate(incidentId, {
        status: updateData.status,
        description: updateData.description,
      });

      // Refresh the incident data to get the latest updates
      await refresh();

      console.log('Update added successfully:', updateData);
    } catch (error) {
      console.error('Failed to add update:', error);
      alert('업데이트 추가에 실패했습니다.');
    } finally {
      setUpdateLoading(false);
    }
  };



  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* 새로 생성된 경우 성공 메시지 */}
        {isNewlyCreated && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              새 장애 이벤트가 성공적으로 생성되었습니다. verify-main에서 확인할 수 있습니다.
            </AlertDescription>
          </Alert>
        )}

        {/* 헤더 */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/incidents">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                목록
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {incident.id}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(incident.created_at)}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                {incident.title}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* 수정 버튼: 로그인된 사용자에게만 표시 (해결된 사건 제외) */}
            {isAuthenticated && !authLoading && user && incident.status !== 'resolved' && (
              <Link href={`/incidents/${incident.id}/edit`}>
                <Button size="sm">
                  <Edit className="w-4 h-4 mr-2" />
                  수정
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 메인 콘텐츠 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 기본 정보 */}
            <Card>
              <CardHeader>
                <CardTitle>상세 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {incident.description && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">설명</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {incident.description}
                    </p>
                  </div>
                )}
                
                {incident.detection_criteria && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">발생 기준 / 감지 방법</h4>
                    <p className="text-sm text-muted-foreground">
                      {incident.detection_criteria}
                    </p>
                  </div>
                )}
                
                <div>
                  <h4 className="text-sm font-medium mb-2">영향받는 서비스</h4>
                  <div className="flex flex-wrap gap-2">
                    {incident.affected_services && incident.affected_services.length > 0 ? (
                      incident.affected_services.map((service) => (
                        <Badge key={service} variant="outline">
                          {formatServiceName(service)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">서비스 정보가 없습니다.</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 타임라인 */}
            <IncidentTimeline
              incidentId={incidentId}
              updates={updates}
              currentStatus={incident.status}
              onAddUpdate={handleAddUpdate}
              canEdit={incident.status !== 'resolved'}
            />
          </div>

          {/* 사이드바 */}
          <div className="space-y-4">
            {/* 현재 상태 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">현재 상태</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <Badge 
                    variant="secondary" 
                    className="text-sm px-3 py-1"
                    style={{
                      backgroundColor: statusInfo.bgColor,
                      color: statusInfo.color,
                      border: `2px solid ${statusInfo.color}`
                    }}
                  >
                    {statusInfo.label}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    {statusInfo.description}
                  </p>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>우선순위:</span>
                    <Badge 
                      variant="outline"
                      style={{
                        backgroundColor: priorityInfo.bgColor,
                        color: priorityInfo.color
                      }}
                    >
                      {priorityInfo.label}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>심각도:</span>
                    <Badge 
                      variant="outline"
                      style={{
                        backgroundColor: severityInfo.bgColor,
                        color: severityInfo.color
                      }}
                    >
                      {severityInfo.label}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 시간 정보 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">시간 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">생성 시간</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(incident.created_at)}
                    </p>
                  </div>
                </div>
                
                {incident.resolved_at && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <div>
                      <p className="font-medium text-green-700">해결 시간</p>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(incident.resolved_at)}
                      </p>
                    </div>
                  </div>
                )}
                
                {resolutionTime && (
                  <div className="p-2 bg-green-50 rounded border border-green-200">
                    <p className="text-sm font-medium text-green-800">
                      총 해결 시간: {resolutionTime}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 담당자 정보 */}
            {incident.reporter && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">담당자 정보</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">보고자</p>
                      <p className="text-muted-foreground">{incident.reporter}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}