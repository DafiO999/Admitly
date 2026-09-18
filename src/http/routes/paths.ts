export const apiPaths = {
  health: '/api/health',
  ready: '/api/ready',
  diagnosis: '/api/diagnosis',
  recommendations: '/api/recommendations',
  recommendationExplanation: '/api/recommendations/:universityId/explanation',
  comparison: '/api/comparison',
  admissionsContact: '/api/universities/:universityId/admissions-contact',
  roadmap: '/api/roadmap',
  profile: '/api/profile',
  plan: '/api/plan/:profileId',
  recalculate: '/api/plan/recalculate',
  roadmapItem: '/api/roadmaps/:roadmapId/items/:itemId',
} as const;
