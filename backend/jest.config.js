module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    "/node_modules/(?!@turf|concaveman|robust-predicates|point-in-polygon-hao|quickselect)"
  ],
};
