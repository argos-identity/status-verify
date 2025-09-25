"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Save, 
  X, 
  AlertTriangle, 
  Clock, 
  User, 
  Server, 
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type {
  Incident,
  IncidentFormData,
  IncidentSeverity,
  IncidentPriority,
  IncidentStatus
} from '@/lib/types';
import {
  AVAILABLE_SERVICES,
  SEVERITY_INFO,
  PRIORITY_INFO,
  STATUS_INFO
} from '@/lib/types';
import { 
  handleKeyboardShortcut, 
  debounce, 
  storage, 
  generateIncidentId,
  suggestPriority
} from '@/lib/utils';

// Zod 스키마 정의 - PRD.md 요구사항 반영
const incidentSchema = z.object({
  title: z.string()
    .min(5, '제목은 5자 이상이어야 합니다')
    .max(255, '제목은 255자를 초과할 수 없습니다'),
  description: z.string()
    .min(20, '상세 설명은 20자 이상이어야 합니다')
    .max(2000, '설명은 2000자를 초과할 수 없습니다'),
  status: z.enum(['investigating', 'identified', 'monitoring', 'resolved'], {
    required_error: '상태를 선택하세요'
  }),
  severity: z.enum(['low', 'medium', 'high', 'critical'], {
    required_error: '심각도를 선택하세요'
  }),
  priority: z.enum(['P1', 'P2', 'P3', 'P4'], {
    required_error: '우선순위를 선택하세요'
  }),
  affected_services: z.array(z.string())
    .min(1, '영향받는 서비스를 최소 1개 이상 선택하세요')
    .max(5, '영향받는 서비스는 최대 5개까지 선택 가능합니다'),
  reporter: z.string()
    .min(1, '보고자를 입력하세요')
    .max(100, '보고자명은 100자를 초과할 수 없습니다'),
  detection_criteria: z.string()
    .min(10, '발생 기준은 10자 이상이어야 합니다')
    .max(500, '발생 기준은 500자를 초과할 수 없습니다')
});

type FormData = z.infer<typeof incidentSchema>;

interface IncidentFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<Incident>;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const IncidentForm: React.FC<IncidentFormProps> = ({
  mode,
  initialData,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [completionProgress, setCompletionProgress] = useState(0);
  
  // 자동 저장을 위한 키
  const autoSaveKey = `incident-form-${mode}-${initialData?.id || 'new'}`;
  
  // React Hook Form 설정
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid, isDirty },
    reset
  } = useForm<FormData>({
    resolver: zodResolver(incidentSchema),
    defaultValues: {
      title: initialData?.title || '',
      description: initialData?.description || '',
      status: initialData?.status,
      severity: initialData?.severity || 'low',
      priority: initialData?.priority || 'P4',
      affected_services: initialData?.affected_services || [],
      reporter: initialData?.reporter || storage.get('last-reporter', ''),
      detection_criteria: initialData?.detection_criteria || ''
    },
    mode: 'onChange'
  });

  // 폼 데이터 감시
  const watchedData = watch() || {};
  
  // 완성도 계산
  const calculateProgress = useCallback((data: Partial<FormData>) => {
    let completed = 0;
    const total = 8;

    if (data?.title?.length >= 5) completed++;
    if (data?.description?.length >= 20) completed++;
    if (data?.status) completed++;
    if (data?.severity) completed++;
    if (data?.priority) completed++;
    if ((data?.affected_services || []).length > 0) completed++;
    if (data?.reporter?.length > 0) completed++;
    if (data?.detection_criteria?.length >= 10) completed++;

    return Math.round((completed / total) * 100);
  }, []);

  // 상태 변경 시 기본값 설정 (우선순위는 자동 변경하지 않음)
  useEffect(() => {
    const status = watchedData?.status;
    if (status && (!initialData || mode === 'create') && !watchedData?.severity) {
      // 상태별 기본 심각도만 설정 (우선순위는 사용자가 직접 선택)
      const statusSeverityMapping = {
        investigating: 'low',   // 조사중: 기본 심각도 낮음
        identified: 'low',      // 원인식별: 기본 심각도 낮음
        monitoring: 'low',      // 모니터링: 기본 심각도 낮음
        resolved: 'low'
      } as const;

      const defaultSeverity = statusSeverityMapping[status as keyof typeof statusSeverityMapping];
      if (defaultSeverity && !watchedData?.severity) {
        setValue('severity', defaultSeverity);
      }
    }
  }, [watchedData?.status, setValue, initialData, mode, watchedData?.severity]);

  // 심각도 변경 시 우선순위 자동 제안 (초기 생성시에만)
  useEffect(() => {
    const severity = watchedData?.severity;

    // 새로 생성하는 경우에만 심각도 기반 우선순위 제안 (우선순위가 아직 설정되지 않은 경우)
    if (severity && mode === 'create' && !initialData && !watchedData?.priority) {
      const suggestedPriority = suggestPriority(severity);
      setValue('priority', suggestedPriority);
    }
  }, [watchedData?.severity, setValue, initialData, mode, watchedData?.priority]);

  // 완성도 업데이트
  useEffect(() => {
    const progress = calculateProgress(watchedData);
    setCompletionProgress(progress);
  }, [watchedData, calculateProgress]);

  // 자동 저장 함수
  const autoSave = useCallback(
    debounce(async (data: Partial<FormData>) => {
      if (mode === 'create' && isDirty) {
        setAutoSaving(true);
        storage.set(autoSaveKey, data);
        storage.set('last-reporter', data.reporter || '');
        setLastSaved(new Date());
        
        // 자동 저장 상태 표시를 위한 딜레이
        setTimeout(() => setAutoSaving(false), 1000);
      }
    }, 30000), // 30초마다 자동 저장
    [mode, isDirty, autoSaveKey]
  );

  // 폼 데이터 변경 시 자동 저장
  useEffect(() => {
    autoSave(watchedData);
  }, [watchedData, autoSave]);

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyboardShortcut(event, {
        save: () => {
          if (isValid) {
            handleSubmit(onSubmit)();
          }
        },
        cancel: onCancel,
        new: () => {}
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isValid, handleSubmit, onSubmit, onCancel]);

  // 컴포넌트 언마운트 시 자동 저장된 데이터 정리
  useEffect(() => {
    return () => {
      if (mode === 'create') {
        // 성공적으로 제출된 경우에만 자동 저장 데이터 삭제
        // 실제 구현에서는 제출 성공 여부에 따라 조건부로 처리
      }
    };
  }, [mode]);

  // 저장된 데이터 복원
  useEffect(() => {
    if (mode === 'create') {
      const savedData = storage.get(autoSaveKey, null);
      if (savedData && !initialData) {
        Object.keys(savedData).forEach(key => {
          setValue(key as keyof FormData, savedData[key]);
        });
      }
    }
  }, [mode, autoSaveKey, setValue, initialData]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {mode === 'create' ? 'New Failure Event 생성' : 'Failure Event 수정'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {mode === 'create' 
              ? '긴급 상황에서 빠른 입력이 가능하도록 설계되었습니다' 
              : `${initialData?.id} 수정`
            }
          </p>
        </div>
        
        {/* 진행률 표시 */}
        <div className="text-right">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-muted-foreground">완성도:</span>
            <span className="text-sm font-medium">{completionProgress}%</span>
            {completionProgress >= 70 && (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            )}
          </div>
          <Progress value={completionProgress} className="w-32" />
          {completionProgress >= 70 && (
            <p className="text-xs text-green-600 mt-1">제출 가능</p>
          )}
        </div>
      </div>

      {/* 자동 저장 상태 */}
      {(autoSaving || lastSaved) && (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            {autoSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                자동 저장 중...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                마지막 저장: {lastSaved?.toLocaleTimeString()}
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 기본 정보 카드 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary" />
              기본 정보
              <Badge variant="destructive" className="text-xs">필수</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 제목 */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium">
                제목 *
              </Label>
              <Input
                id="title"
                placeholder="예: ID Recognition 서비스 응답 지연"
                className={`${errors.title ? 'border-destructive' : ''} text-base`}
                {...register('title')}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* 설명 */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                상세 설명 *
              </Label>
              <Textarea
                id="description"
                rows={4}
                placeholder="문제 상황을 구체적으로 설명해주세요. 언제, 어떤 상황에서 발생했는지, 현재 영향 범위는 어느 정도인지 등을 포함해주세요."
                className={`${errors.description ? 'border-destructive' : ''} text-base`}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                최소 20자 이상 입력하세요. 현재: {watchedData?.description?.length || 0}자
              </p>
            </div>

            {/* 상태 */}
            <div className="space-y-2">
              <Label htmlFor="status" className="text-sm font-medium">
                상태 * <span className="text-xs text-muted-foreground">(우선순위와 심각도 자동 설정)</span>
              </Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="상태 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_INFO).map(([key, info]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <span>{info.label}</span>
                            <span className="text-xs text-muted-foreground">
                              - {info.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.status && (
                <p className="text-xs text-destructive">{errors.status.message}</p>
              )}
            </div>

            {/* 심각도와 우선순위 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="severity" className="text-sm font-medium">
                  심각도 *
                </Label>
                <Controller
                  name="severity"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="심각도 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SEVERITY_INFO).map(([key, info]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <span>{info.label}</span>
                              <span className="text-xs text-muted-foreground">
                                - {info.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.severity && (
                  <p className="text-xs text-destructive">{errors.severity.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority" className="text-sm font-medium">
                  우선순위 * <span className="text-xs text-muted-foreground">(심각도 기반 자동 제안)</span>
                </Label>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="우선순위 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORITY_INFO).map(([key, info]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <span>{info.label}</span>
                              <span className="text-xs text-muted-foreground">
                                - {info.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.priority && (
                  <p className="text-xs text-destructive">{errors.priority.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 영향 범위 카드 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              영향 범위
              <Badge variant="destructive" className="text-xs">필수</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="text-sm font-medium">영향받는 서비스 *</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {AVAILABLE_SERVICES.map((service) => (
                  <div key={service.id} className="flex items-center space-x-2">
                    <Controller
                      name="affected_services"
                      control={control}
                      render={({ field }) => (
                        <Checkbox
                          id={service.id}
                          checked={(field.value || []).includes(service.id)}
                          onCheckedChange={(checked) => {
                            const currentValue = field.value || [];
                            const newValue = checked
                              ? [...currentValue, service.id]
                              : currentValue.filter(id => id !== service.id);
                            field.onChange(newValue);
                          }}
                        />
                      )}
                    />
                    <Label htmlFor={service.id} className="text-sm cursor-pointer">
                      {service.name}
                    </Label>
                  </div>
                ))}
              </div>
              {errors.affected_services && (
                <p className="text-xs text-destructive">{errors.affected_services.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 추가 정보 카드 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              추가 정보
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 보고자 */}
            <div className="space-y-2">
              <Label htmlFor="reporter" className="text-sm font-medium">
                보고자 *
              </Label>
              <Input
                id="reporter"
                placeholder="예: 운영팀 - 김민수, 모니터링 시스템"
                className={`${errors.reporter ? 'border-destructive' : ''} text-base`}
                {...register('reporter')}
              />
              {errors.reporter && (
                <p className="text-xs text-destructive">{errors.reporter.message}</p>
              )}
            </div>

            {/* 감지 기준 */}
            <div className="space-y-2">
              <Label htmlFor="detection_criteria" className="text-sm font-medium">
                발생 기준 / 감지 방법 *
              </Label>
              <Textarea
                id="detection_criteria"
                rows={3}
                placeholder="예: 연속 3회 7초 초과 응답시간 감지, 시간당 5회 이상 타임아웃 발생"
                className={`${errors.detection_criteria ? 'border-destructive' : ''} text-base`}
                {...register('detection_criteria')}
              />
              {errors.detection_criteria && (
                <p className="text-xs text-destructive">{errors.detection_criteria.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 액션 버튼들 */}
        <div className="flex items-center justify-end pt-6 border-t">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              <X className="w-4 h-4 mr-2" />
              취소
            </Button>
            
            <Button
              type="submit"
              disabled={loading || completionProgress < 70}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {mode === 'create' ? '생성' : '수정'}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* 모바일 최적화 안내 */}
      <div className="md:hidden bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">📱 모바일 최적화</h4>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• 필수 항목만 입력하면 빠른 생성이 가능합니다</li>
          <li>• 30초마다 자동 저장되어 데이터가 보호됩니다</li>
          <li>• 큰 터치 영역으로 편리한 입력이 가능합니다</li>
        </ul>
      </div>
    </div>
  );
};

export default IncidentForm;