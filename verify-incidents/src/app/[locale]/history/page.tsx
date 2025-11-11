"use client";

import { useState } from 'react';
import { Calendar, Download, Filter, TrendingUp } from 'lucide-react';
import Header from '@/components/sections/header';
import Footer from '@/components/sections/footer';
import IncidentList from '@/components/sections/incident-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mockIncidents, getIncidentStats } from '@/lib/mock-data';
import { calculateResolutionTime } from '@/lib/utils';

export default function HistoryPage() {
  const [timeRange, setTimeRange] = useState('30d');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // 해결된 장애 이벤트만 필터링
  const resolvedIncidents = mockIncidents.filter(incident => 
    incident.status === 'resolved' &&
    (statusFilter === 'all' || incident.status === statusFilter)
  );

  // 통계 계산
  const stats = getIncidentStats();
  const avgResolutionTime = resolvedIncidents
    .map(incident => {
      const time = calculateResolutionTime(incident.created_at, incident.resolved_at ?? undefined);
      if (!time) return 0;
      
      // 시간 문자열을 분 단위로 변환 (간단한 파싱)
      if (time.includes('분')) {
        return parseInt(time.match(/(\d+)분/)?.[1] || '0');
      } else if (time.includes('시간')) {
        const hours = parseInt(time.match(/(\d+)시간/)?.[1] || '0');
        const minutes = parseInt(time.match(/(\d+)분/)?.[1] || '0');
        return hours * 60 + minutes;
      } else if (time.includes('일')) {
        const days = parseInt(time.match(/(\d+)일/)?.[1] || '0');
        const hours = parseInt(time.match(/(\d+)시간/)?.[1] || '0');
        return days * 24 * 60 + hours * 60;
      }
      return 0;
    })
    .reduce((sum, time, _, arr) => sum + time / arr.length, 0);

  const formatAvgTime = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)}분`;
    if (minutes < 24 * 60) {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
    }
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  };

  const handleExport = () => {
    // CSV 내보내기 시뮬레이션
    const csvContent = [
      ['ID', '제목', '상태', '우선순위', '심각도', '생성일', '해결일', '해결시간'],
      ...resolvedIncidents.map(incident => [
        incident.id,
        incident.title,
        incident.status,
        incident.priority,
        incident.severity,
        incident.created_at,
        incident.resolved_at || '',
        calculateResolutionTime(incident.created_at, incident.resolved_at ?? undefined) || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `incidents-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        {/* 페이지 헤더 */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Failure Event 히스토리
              </h1>
              <p className="text-muted-foreground mt-1">
                해결된 장애 이벤트의 히스토리와 분석 데이터를 확인합니다
              </p>
            </div>
            <Button 
              onClick={handleExport}
              variant="outline" 
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              CSV 내보내기
            </Button>
          </div>

          {/* 통계 대시보드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">총 해결된 장애 이벤트</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {stats.byStatus.resolved}
                </div>
                <p className="text-xs text-muted-foreground">
                  전체의 {stats.resolvedPercentage}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">평균 해결 시간</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatAvgTime(avgResolutionTime)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {resolvedIncidents.length}건 기준
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">P1 해결률</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  100%
                </div>
                <p className="text-xs text-muted-foreground">
                  Critical 장애 이벤트
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">이번 달 해결</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {resolvedIncidents.filter(i => 
                    new Date(i.resolved_at!).getMonth() === new Date().getMonth()
                  ).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  9월 해결 건수
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 필터 섹션 */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">필터:</span>
            </div>

            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">최근 7일</SelectItem>
                <SelectItem value="30d">최근 30일</SelectItem>
                <SelectItem value="90d">최근 90일</SelectItem>
                <SelectItem value="1y">최근 1년</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="w-4 h-4" />
              <span>
                {resolvedIncidents.length}개의 해결된 장애 이벤트
              </span>
            </div>
          </div>
        </div>

        {/* 해결된 장애 이벤트 목록 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">해결된 장애 이벤트</h2>
            <Badge variant="secondary">
              {resolvedIncidents.length}건
            </Badge>
          </div>
          
          <IncidentList incidents={resolvedIncidents} />
        </div>

        {resolvedIncidents.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              해결된 장애 이벤트가 없습니다
            </h3>
            <p className="text-muted-foreground">
              선택한 기간에 해결된 장애 이벤트가 없습니다
            </p>
          </div>
        )}
      </div>
      
      <Footer />
    </div>
  );
}