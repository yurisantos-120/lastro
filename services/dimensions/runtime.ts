import { env } from 'cloudflare:workers';
import { DimensionGovernanceRepository } from '../../db/dimension-governance.ts';
export function dimensionRepository(){if(!env.DB)throw new Error('Banco DB indisponível.');return new DimensionGovernanceRepository(env.DB);}
