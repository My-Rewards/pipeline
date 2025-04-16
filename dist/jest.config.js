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
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        "./lambda/**/*.ts": {
            branches: 60,
            functions: 60,
            lines: 60,
            statements: 60
        }
    },
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1"
    }
};
exports.default = config;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiamVzdC5jb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9qZXN0LmNvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLE1BQU0sTUFBTSxHQUFXO0lBQ3JCLGVBQWUsRUFBRSxNQUFNO0lBQ3ZCLEtBQUssRUFBRSxDQUFDLGdCQUFnQixDQUFDO0lBQ3pCLFdBQVcsRUFBRTtRQUNYLFdBQVc7S0FDWjtJQUNELGlCQUFpQixFQUFFLFVBQVU7SUFDN0IsU0FBUyxFQUFFLENBQUMsY0FBYyxDQUFDO0lBQzNCLG9CQUFvQixFQUFFLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUM7SUFDaEUsU0FBUyxFQUFFLEVBQUMsYUFBYSxFQUFFLFNBQVMsRUFBQztJQUNyQyxtQkFBbUIsRUFBRTtRQUNuQiwwQkFBMEI7UUFDMUIsNkJBQTZCO1FBQzdCLGdDQUFnQztLQUNqQztJQUNELE9BQU8sRUFBRTtRQUNQLFNBQVMsRUFBRTtZQUNULGVBQWUsRUFBRSxJQUFJO1NBQ3RCO0tBQ0Y7SUFDRCxpQkFBaUIsRUFBRTtRQUNqQixNQUFNLEVBQUU7WUFDTixRQUFRLEVBQUUsRUFBRTtZQUNaLFNBQVMsRUFBRSxFQUFFO1lBQ2IsS0FBSyxFQUFFLEVBQUU7WUFDVCxVQUFVLEVBQUUsRUFBRTtTQUNmO1FBQ0Qsa0JBQWtCLEVBQUU7WUFDbEIsUUFBUSxFQUFFLEVBQUU7WUFDWixTQUFTLEVBQUUsRUFBRTtZQUNiLEtBQUssRUFBRSxFQUFFO1lBQ1QsVUFBVSxFQUFFLEVBQUU7U0FDZjtLQUVGO0lBQ0QsZ0JBQWdCLEVBQUU7UUFDaEIsVUFBVSxFQUFFLGNBQWM7S0FDM0I7Q0FFRixDQUFDO0FBRUYsa0JBQWUsTUFBTSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBDb25maWcgfSBmcm9tICdqZXN0JztcblxuY29uc3QgY29uZmlnOiBDb25maWcgPSB7XG4gIHRlc3RFbnZpcm9ubWVudDogJ25vZGUnLFxuICByb290czogWyc8cm9vdERpcj4vdGVzdCddLFxuICBtb2R1bGVQYXRoczogW1xuICAgIFwiPHJvb3REaXI+XCJcbiAgXSxcbiAgY292ZXJhZ2VEaXJlY3Rvcnk6ICdjb3ZlcmFnZScsXG4gIHRlc3RNYXRjaDogWycqKi8qLnRlc3QudHMnXSxcbiAgbW9kdWxlRmlsZUV4dGVuc2lvbnM6IFsndHMnLCAndHN4JywgJ2pzJywgJ2pzeCcsICdqc29uJywgJ25vZGUnXSxcbiAgdHJhbnNmb3JtOiB7J14uK1xcXFwudHN4PyQnOiAndHMtamVzdCd9LFxuICBjb2xsZWN0Q292ZXJhZ2VGcm9tOiBbXG4gICAgJzxyb290RGlyPi9sYW1iZGEvKiovKi50cycsXG4gICAgJyE8cm9vdERpcj4vbGFtYmRhLyoqLyouZC50cycsXG4gICAgJyE8cm9vdERpcj4vbGFtYmRhLyoqLyoudGVzdC50cycsXG4gIF0sXG4gIGdsb2JhbHM6IHtcbiAgICAndHMtamVzdCc6IHtcbiAgICAgIGlzb2xhdGVkTW9kdWxlczogdHJ1ZVxuICAgIH1cbiAgfSxcbiAgY292ZXJhZ2VUaHJlc2hvbGQ6IHtcbiAgICBnbG9iYWw6IHtcbiAgICAgIGJyYW5jaGVzOiA4MCxcbiAgICAgIGZ1bmN0aW9uczogODAsXG4gICAgICBsaW5lczogODAsXG4gICAgICBzdGF0ZW1lbnRzOiA4MFxuICAgIH0sXG4gICAgXCIuL2xhbWJkYS8qKi8qLnRzXCI6IHtcbiAgICAgIGJyYW5jaGVzOiA2MCxcbiAgICAgIGZ1bmN0aW9uczogNjAsXG4gICAgICBsaW5lczogNjAsXG4gICAgICBzdGF0ZW1lbnRzOiA2MFxuICAgIH1cblxuICB9LFxuICBtb2R1bGVOYW1lTWFwcGVyOiB7XG4gICAgXCJeQC8oLiopJFwiOiBcIjxyb290RGlyPi8kMVwiXG4gIH1cblxufTtcblxuZXhwb3J0IGRlZmF1bHQgY29uZmlnOyJdfQ==