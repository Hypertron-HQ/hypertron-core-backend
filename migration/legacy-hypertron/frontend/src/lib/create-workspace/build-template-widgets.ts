import { OPERATION_MODULE_LABELS } from "@/lib/create-workspace/constants";
import {
  defaultWidgetSettings,
  type DashboardWidget,
  type WidgetType,
} from "@/lib/my-templates-storage";

export function widgetsFromOperationModules(moduleIds: string[]): DashboardWidget[] {
  const settings = defaultWidgetSettings();
  const stamp = Date.now();
  return moduleIds.map((moduleId, i) => {
    const col = (i % 4) * 3;
    const row = Math.floor(i / 4) * 5;
    const title =
      OPERATION_MODULE_LABELS[moduleId] ??
      moduleId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      id: `dw-${stamp}-${i}`,
      widgetId: moduleId,
      title,
      type: "chart" as WidgetType,
      x: col,
      y: row,
      w: 3,
      h: 5,
      settings,
    };
  });
}
