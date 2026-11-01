'use client';

import { useEffect, useRef } from 'react';
import type { AnalyticsQueryResultV1, ChartTypeV1 } from '@gigalibs/contracts';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { toEChartsOption } from '../index.js';
import type { ModuleAnalyticsWorkbenchTheme } from './types.js';

echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

const DEFAULT_THEME: ModuleAnalyticsWorkbenchTheme = {
  palette: ['#3b82f6', '#10b981', '#f97316', '#a78bfa', '#f43f5e', '#a1a1aa'],
  text: { color: '#18181b', muted: '#52525b' },
};

export function ModuleAnalyticsChart(props: {
  readonly result: AnalyticsQueryResultV1;
  readonly type: Extract<ChartTypeV1, 'line' | 'column'>;
  readonly theme?: ModuleAnalyticsWorkbenchTheme;
  readonly height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = props.theme ?? DEFAULT_THEME;

  useEffect(() => {
    const node = containerRef.current;
    if (!node || props.result.rows.length === 0) return;
    const chart = echarts.init(node, undefined, { renderer: 'svg' });
    const option = toEChartsOption(props.result, props.type, theme.palette, theme.text);
    if (option) chart.setOption(option, true);
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [props.result, props.type, theme]);

  return <div ref={containerRef} style={{ width: '100%', height: props.height ?? 280 }} role="img" aria-label="Module analytics trend chart" />;
}
