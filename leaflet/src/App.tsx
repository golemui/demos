import { useRef } from 'react';
import { GuiForm } from '@golemui/gui-react';
import type { FormComponentHandle } from '@golemui/react';
import type { FormEvent } from '@golemui/core';
import { formDef, initialData } from './form/formDef';
import { customWidgetLoaders } from './widgets/customWidgetLoaders';
import { DemoShell } from './_shared/DemoShell';

const config = {
  formDef,
  data: initialData,
  formConfig: {
    widgetLoaders: customWidgetLoaders,
  },
};

export default function App() {
  const formRef = useRef<FormComponentHandle>(null);

  // Edits to inputs *inside* a repeater update the store but don't trigger a
  // global recompute, so sibling widgets (the map, the summary) never see them.
  // The repeater's address field emits `tripChanged`; we answer it by
  // re-committing the data at the top level via setData(), which forces a full
  // recompute. Their reactive runtime props then re-read the fresh data.
  function handleFormEvent(event: FormEvent) {
    if (event.name === 'tripChanged') {
      const data = event.data;
      queueMicrotask(() => formRef.current?.setData(data));
    }
  }

  return (
    <DemoShell demoName="Leaflet maps integration">
      <GuiForm ref={formRef} config={config} formEvent={handleFormEvent} />
    </DemoShell>
  );
}
