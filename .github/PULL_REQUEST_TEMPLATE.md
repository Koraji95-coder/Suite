# Pull Request

## Description
<!-- Provide a clear and concise description of your changes -->



## Type of Change
<!-- Mark the relevant option with an 'x' -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that breaks existing functionality)
- [ ] Performance improvement
- [ ] Code refactoring
- [ ] Documentation update
- [ ] Dependency update
- [ ] Configuration change

## Related Issues
<!-- Link any related issues using #issue_number -->

Fixes #
Relates to #

## Changes Made
<!-- Provide a bulleted list of specific changes -->

- 
- 
- 

## Testing
<!-- Describe the testing you performed -->

- [ ] Tested locally with `npm run dev`
- [ ] Tested production build with `npm run build`
- [ ] TypeScript compilation passes (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Tested in multiple browsers (Chrome, Firefox, Safari, Edge)
- [ ] Tested responsive design on mobile devices
- [ ] Manually tested all affected features
- [ ] Added/updated unit tests (if applicable)
- [ ] All tests passing

## Security Considerations
<!-- Check all that apply -->

- [ ] No new third-party dependencies added
- [ ] Dependencies are from trusted sources with recent activity
- [ ] No hardcoded credentials or sensitive data
- [ ] User input is properly validated and sanitized
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (escaped output)
- [ ] CSRF tokens used for state-changing operations
- [ ] Authentication checks in place for protected routes
- [ ] Authorization/permissions verified
- [ ] Supabase Row Level Security (RLS) policies reviewed
- [ ] API rate limiting considerations
- [ ] Secure communication (HTTPS in production)
- [ ] No security vulnerabilities introduced (ran `npm audit`)

## Code Quality
<!-- Check all that apply -->

- [ ] Code follows project style guidelines
- [ ] No TypeScript errors or warnings
- [ ] No console.log statements in production code
- [ ] Meaningful variable and function names
- [ ] Added comments for complex logic
- [ ] Removed commented-out code
- [ ] No duplicate code
- [ ] Functions are small and focused
- [ ] Proper error handling implemented
- [ ] Loading states implemented for async operations

## Database Changes
<!-- If applicable -->

- [ ] No database changes
- [ ] Database migration created and tested
- [ ] RLS policies updated
- [ ] Backward compatible with existing data
- [ ] Tested migration rollback

## Documentation
<!-- Check all that apply -->

- [ ] README updated (if needed)
- [ ] Component documentation added/updated
- [ ] API documentation updated
- [ ] Code comments added for complex logic
- [ ] CHANGELOG.md updated

## Dependencies
<!-- If you added/updated dependencies -->

- [ ] No dependency changes
- [ ] `package.json` updated
- [ ] `package-lock.json` regenerated
- [ ] No high/critical security vulnerabilities (`npm audit`)
- [ ] Dependencies are actively maintained (last update <1 year)
- [ ] Bundle size impact assessed
- [ ] License compatibility verified

## Performance
<!-- Check all that apply -->

- [ ] No performance impact
- [ ] Tested with large datasets
- [ ] No memory leaks (Chrome DevTools Memory Profiler)
- [ ] Images optimized
- [ ] Code splitting implemented for large features
- [ ] Lazy loading used appropriately
- [ ] Unnecessary re-renders prevented (React.memo, useMemo, useCallback)
- [ ] Database queries optimized (indexes, joins)

## Accessibility
<!-- Check all that apply -->

- [ ] No UI changes
- [ ] Semantic HTML used
- [ ] ARIA labels added where needed
- [ ] Keyboard navigation works
- [ ] Focus management implemented
- [ ] Color contrast meets WCAG AA standards
- [ ] Screen reader tested
- [ ] Forms have proper labels
- [ ] Error messages are descriptive

## Deployment Considerations

- [ ] No environment variables added
- [ ] Environment variables documented in `.env.example`
- [ ] No breaking changes to API
- [ ] Database migrations can run without downtime
- [ ] Feature flags used for gradual rollout (if applicable)
- [ ] Rollback plan documented

## Screenshots
<!-- Add screenshots for UI changes -->

**Before:**


**After:**


## Additional Notes
<!-- Any additional context, concerns, or questions -->



---

## Reviewer Checklist
<!-- For code reviewers -->

- [ ] Code is clear and maintainable
- [ ] Security considerations addressed
- [ ] Performance impact acceptable
- [ ] Tests are adequate
- [ ] Documentation is complete
- [ ] No obvious bugs or edge cases missed
