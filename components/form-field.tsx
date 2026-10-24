'use client';
import { Children, cloneElement, isValidElement, useId, useState, type ReactNode, type ReactElement, type SyntheticEvent } from 'react';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';

type ControlProps = { id?: string; name?: string; required?: boolean; onChange?: unknown; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false'; 'aria-required'?: boolean; onInvalid?: (event: SyntheticEvent<HTMLElement>) => void };
export function FormField({ label, children, className, indication = 'auto', description, error }: {
  label: ReactNode; children?: ReactNode; className?: string;
  indication?: 'auto' | 'none' | 'required' | 'optional'; description?: ReactNode; error?: string;
}) {
  const generated = useId();
  const [nativeError, setNativeError] = useState('');
  const parts = Children.toArray(children);
  const control = parts.find((child) => isValidElement<ControlProps>(child) && (child.props.name || child.props.id || child.props.onChange || ['input', 'select', 'textarea'].includes(String(child.type)))) as ReactElement<ControlProps> | undefined;
  const id = control?.props.id || generated;
  const help = parts.filter((child) => child !== control);
  const message = error || nativeError;
  const required = Boolean(control?.props.required) || indication === 'required';
  return <div className={cn('lastro-field space-y-1', className)} onChangeCapture={() => setNativeError('')}>
    <label htmlFor={id} className="block text-sm font-medium">{label}{indication !== 'none' && (required ? ' (obrigatório)' : ' (opcional)')}</label>
    {control && cloneElement(control, { id,
      'aria-required': required || control.props['aria-required'],
      'aria-invalid': message ? true : control.props['aria-invalid'],
      'aria-describedby': [control.props['aria-describedby'], help.length || description ? `${id}-help` : '', message ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
      onInvalid: (event) => { const target = event.currentTarget as HTMLInputElement; setNativeError(target.validationMessage); control.props.onInvalid?.(event); },
    })}
    {(help.length > 0 || description) && <div id={`${id}-help`} className="text-xs text-muted-foreground">{description}{help}</div>}
    {message && <Alert id={`${id}-error`} variant="error">{message}</Alert>}
  </div>;
}
