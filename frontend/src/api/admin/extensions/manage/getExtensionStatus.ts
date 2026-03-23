import { z } from 'zod';
import { axiosInstance } from '@/api/axios.ts';
import { adminBackendExtensionSchema } from '@/lib/schemas/admin/backendExtension.ts';

export interface ExtensionStatus {
  isBuilding: boolean;
  pendingExtensions: z.infer<typeof adminBackendExtensionSchema>[];
  removedExtensions: z.infer<typeof adminBackendExtensionSchema>[];
}

export default async (): Promise<ExtensionStatus> => {
  return new Promise((resolve, reject) => {
    axiosInstance
      .get('/api/admin/extensions/manage/status')
      .then(({ data }) => resolve(data))
      .catch(reject);
  });
};
