import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = nextCoreWebVitals.map((block) => {
  if (block.name !== 'next') return block;
  return {
    ...block,
    rules: {
      ...block.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'import/no-anonymous-default-export': 'off',
    },
  };
});

export default eslintConfig;
