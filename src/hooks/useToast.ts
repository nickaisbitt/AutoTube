import { addToast, type ToastType } from '../components/Toast';

export function toast(message: string, type: ToastType = 'info') {
  addToast(message, type);
}
