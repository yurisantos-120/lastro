import { getGlpiService } from '@/services/glpi/glpi-runtime';
import { glpiFailure } from '@/services/glpi/glpi-errors';
import { getAuthService } from '@/services/auth/auth-runtime';
import { withRequiredRole } from '@/services/auth/api-access';

export async function GET(request: Request) {
  return withRequiredRole(request, 'admin', (token) => getAuthService().currentUser(token), async () => {
  try {
    await getGlpiService().testConnection();
    return Response.json(
      { success: true, message: 'Conexão com GLPI realizada com sucesso.', version: 'Não verificada; compatibilidade de referência: 9.5.4' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const { body, status } = glpiFailure(error);
    return Response.json(body, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  });
}
