"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    modulePaths: [
        "<rootDir>"
    ],
    coverageDirectory: 'coverage',
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    transform: { '^.+\\.tsx?$': 'ts-jest' },
    collectCoverageFrom: [
        '<rootDir>/lambda/**/*.ts',
        '!<rootDir>/lambda/**/*.d.ts',
        '!<rootDir>/lambda/**/*.test.ts',
    ],
    globals: {
        'ts-jest': {
            isolatedModules: true
        }
    },
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50
        },
        // "./lambda/**/*.ts": {
        //   branches: 60,
        //   functions: 60,
        //   lines: 60,
        //   statements: 60
        // }
    },
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1"
    }
};
exports.default = config;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiamVzdC5jb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9qZXN0LmNvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLE1BQU0sTUFBTSxHQUFXO0lBQ3JCLGVBQWUsRUFBRSxNQUFNO0lBQ3ZCLEtBQUssRUFBRSxDQUFDLGdCQUFnQixDQUFDO0lBQ3pCLFdBQVcsRUFBRTtRQUNYLFdBQVc7S0FDWjtJQUNELGlCQUFpQixFQUFFLFVBQVU7SUFDN0IsU0FBUyxFQUFFLENBQUMsY0FBYyxDQUFDO0lBQzNCLG9CQUFvQixFQUFFLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUM7SUFDaEUsU0FBUyxFQUFFLEVBQUMsYUFBYSxFQUFFLFNBQVMsRUFBQztJQUNyQyxtQkFBbUIsRUFBRTtRQUNuQiwwQkFBMEI7UUFDMUIsNkJBQTZCO1FBQzdCLGdDQUFnQztLQUNqQztJQUNELE9BQU8sRUFBRTtRQUNQLFNBQVMsRUFBRTtZQUNULGVBQWUsRUFBRSxJQUFJO1NBQ3RCO0tBQ0Y7SUFDRCxpQkFBaUIsRUFBRTtRQUNqQixNQUFNLEVBQUU7WUFDTixRQUFRLEVBQUUsRUFBRTtZQUNaLFNBQVMsRUFBRSxFQUFFO1lBQ2IsS0FBSyxFQUFFLEVBQUU7WUFDVCxVQUFVLEVBQUUsRUFBRTtTQUNmO1FBQ0Qsd0JBQXdCO1FBQ3hCLGtCQUFrQjtRQUNsQixtQkFBbUI7UUFDbkIsZUFBZTtRQUNmLG1CQUFtQjtRQUNuQixJQUFJO0tBRUw7SUFDRCxnQkFBZ0IsRUFBRTtRQUNoQixVQUFVLEVBQUUsY0FBYztLQUMzQjtDQUVGLENBQUM7QUFFRixrQkFBZSxNQUFNLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IENvbmZpZyB9IGZyb20gJ2plc3QnO1xuXG5jb25zdCBjb25maWc6IENvbmZpZyA9IHtcbiAgdGVzdEVudmlyb25tZW50OiAnbm9kZScsXG4gIHJvb3RzOiBbJzxyb290RGlyPi90ZXN0J10sXG4gIG1vZHVsZVBhdGhzOiBbXG4gICAgXCI8cm9vdERpcj5cIlxuICBdLFxuICBjb3ZlcmFnZURpcmVjdG9yeTogJ2NvdmVyYWdlJyxcbiAgdGVzdE1hdGNoOiBbJyoqLyoudGVzdC50cyddLFxuICBtb2R1bGVGaWxlRXh0ZW5zaW9uczogWyd0cycsICd0c3gnLCAnanMnLCAnanN4JywgJ2pzb24nLCAnbm9kZSddLFxuICB0cmFuc2Zvcm06IHsnXi4rXFxcXC50c3g/JCc6ICd0cy1qZXN0J30sXG4gIGNvbGxlY3RDb3ZlcmFnZUZyb206IFtcbiAgICAnPHJvb3REaXI+L2xhbWJkYS8qKi8qLnRzJyxcbiAgICAnITxyb290RGlyPi9sYW1iZGEvKiovKi5kLnRzJyxcbiAgICAnITxyb290RGlyPi9sYW1iZGEvKiovKi50ZXN0LnRzJyxcbiAgXSxcbiAgZ2xvYmFsczoge1xuICAgICd0cy1qZXN0Jzoge1xuICAgICAgaXNvbGF0ZWRNb2R1bGVzOiB0cnVlXG4gICAgfVxuICB9LFxuICBjb3ZlcmFnZVRocmVzaG9sZDoge1xuICAgIGdsb2JhbDoge1xuICAgICAgYnJhbmNoZXM6IDUwLFxuICAgICAgZnVuY3Rpb25zOiA1MCxcbiAgICAgIGxpbmVzOiA1MCxcbiAgICAgIHN0YXRlbWVudHM6IDUwXG4gICAgfSxcbiAgICAvLyBcIi4vbGFtYmRhLyoqLyoudHNcIjoge1xuICAgIC8vICAgYnJhbmNoZXM6IDYwLFxuICAgIC8vICAgZnVuY3Rpb25zOiA2MCxcbiAgICAvLyAgIGxpbmVzOiA2MCxcbiAgICAvLyAgIHN0YXRlbWVudHM6IDYwXG4gICAgLy8gfVxuXG4gIH0sXG4gIG1vZHVsZU5hbWVNYXBwZXI6IHtcbiAgICBcIl5ALyguKikkXCI6IFwiPHJvb3REaXI+LyQxXCJcbiAgfVxuXG59O1xuXG5leHBvcnQgZGVmYXVsdCBjb25maWc7Il19