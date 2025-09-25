"use client";

import { useState, useEffect, useCallback } from 'react';
import { Plus, Filter, Search, RefreshCw, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/sections/header';
import Footer from '@/components/sections/footer';
import IncidentList from '@/components/sections/incident-list';
import IncidentDashboard from '@/components/sections/incident-dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useIncidents, useIncidentStats } from '@/hooks/use-incidents';
import { useAuth } from '@/hooks/use-auth';
import type { IncidentFilters } from '@/lib/types';
import { handleKeyboardShortcut } from '@/lib/utils';

export default function IncidentsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<IncidentFilters>({
    status: 'all',
    priority: 'all',
    severity: 'all',
    affected_service: 'all'
  });

  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Use API hooks instead of mock data
  const {
    incidents: allIncidents,
    loading: incidentsLoading,
    error: incidentsError,
    refresh: refreshIncidents
  } = useIncidents();

  const {
    stats,
    loading: statsLoading,
    error: statsError,
    refresh: refreshStats
  } = useIncidentStats();

  // Client-side filtering for search and additional filters
  const filteredIncidents = allIncidents.filter(incident => {
    const matchesSearch =
      incident.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.reporter?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filters.status === 'all' || incident.status === filters.status;
    const matchesPriority = filters.priority === 'all' || incident.priority === filters.priority;
    const matchesSeverity = filters.severity === 'all' || incident.severity === filters.severity;
    const matchesService = filters.affected_service === 'all' ||
      incident.affected_services.includes(filters.affected_service as string);

    return matchesSearch && matchesStatus && matchesPriority && matchesSeverity && matchesService;
  });

  // Handle refresh
  const handleRefresh = async () => {
    await Promise.all([refreshIncidents(), refreshStats()]);
  };

  // Handle New Failure Event button click
  const handleNewFailureEvent = useCallback(() => {
    if (!isAuthenticated) {
      router.push('/auth/login?callbackUrl=/incidents/create');
    } else {
      router.push('/incidents/create');
    }
  }, [isAuthenticated, router]);

  // 키보드 단축키 처리
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyboardShortcut(event, {
        new: () => handleNewFailureEvent(),
        save: () => {},
        cancel: () => {}
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleNewFailureEvent]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        {/* 페이지 헤더 */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Failure Event 관리
              </h1>
              <p className="text-muted-foreground mt-1">
                시스템 장애 및 이벤트를 관리하고 추적합니다
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                disabled={incidentsLoading || statsLoading}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${(incidentsLoading || statsLoading) ? 'animate-spin' : ''}`} />
                새로고침
              </Button>
              <Button
                onClick={handleNewFailureEvent}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90"
                disabled={authLoading}
              >
                <Plus className="w-4 h-4" />
                New Failure Event
              </Button>
            </div>
          </div>

          {/* Error Display */}
          {(incidentsError || statsError) && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {incidentsError || statsError}
                {((incidentsError && incidentsError.includes('Permission denied')) ||
                  (statsError && statsError.includes('Permission denied'))) && (
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
          )}

          {/* 통계 대시보드 */}
          <IncidentDashboard stats={stats} loading={statsLoading} />
        </div>

        {/* 검색 및 필터 섹션 */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="flex flex-col gap-4">
            {/* 검색바 */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="제목, 설명, 보고자로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 필터들 */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">필터:</span>
              </div>

              <Select 
                value={filters.status} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value as any }))}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 상태</SelectItem>
                  <SelectItem value="investigating">조사 중</SelectItem>
                  <SelectItem value="identified">원인 식별</SelectItem>
                  <SelectItem value="monitoring">모니터링</SelectItem>
                  <SelectItem value="resolved">해결됨</SelectItem>
                </SelectContent>
              </Select>

              <Select 
                value={filters.priority} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value as any }))}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="우선순위" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 우선순위</SelectItem>
                  <SelectItem value="P1">P1 - Critical</SelectItem>
                  <SelectItem value="P2">P2 - High</SelectItem>
                  <SelectItem value="P3">P3 - Medium</SelectItem>
                </SelectContent>
              </Select>

              <Select 
                value={filters.severity} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, severity: value as any }))}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="심각도" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 심각도</SelectItem>
                  <SelectItem value="critical">치명적</SelectItem>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="medium">중간</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>

              <Select 
                value={filters.affected_service} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, affected_service: value as any }))}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="영향 서비스" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 서비스</SelectItem>
                  <SelectItem value="id-recognition">ID Recognition</SelectItem>
                  <SelectItem value="face-liveness">Face Liveness</SelectItem>
                  <SelectItem value="id-liveness">ID Liveness</SelectItem>
                  <SelectItem value="face-compare">Face Compare</SelectItem>
                  <SelectItem value="curp-verifier">Curp Verifier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 활성 필터 표시 */}
            {(searchTerm || 
              filters.status !== 'all' || 
              filters.priority !== 'all' || 
              filters.severity !== 'all' || 
              filters.affected_service !== 'all') && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground">활성 필터:</span>
                {searchTerm && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    검색: "{searchTerm}"
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {filters.status !== 'all' && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    상태: {filters.status}
                    <button 
                      onClick={() => setFilters(prev => ({ ...prev, status: 'all' }))}
                      className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                    >
                      ×
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 검색 결과 정보 */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {incidentsLoading ? (
              "로딩 중..."
            ) : (
              `${filteredIncidents.length}개의 장애 이벤트 (${allIncidents.length}개 중)`
            )}
          </p>
        </div>

        {/* Incident 목록 */}
        <IncidentList
          incidents={filteredIncidents}
          loading={incidentsLoading}
          error={incidentsError}
        />

      </div>
      
      <Footer />
    </div>
  );
}