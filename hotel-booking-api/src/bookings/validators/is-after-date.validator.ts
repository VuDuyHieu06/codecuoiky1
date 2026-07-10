import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validator tuỳ chỉnh: kiểm tra trường được gắn decorator này phải có giá
 * trị (thời gian) SAU trường được tham chiếu (property) trong cùng DTO.
 *
 * Dùng để đảm bảo `checkOutDate` luôn lớn hơn `checkInDate` ngay tại tầng
 * DTO — phát hiện lỗi sớm nhất có thể, trước khi request chạm tới Service/DB.
 */
@ValidatorConstraint({ name: 'IsAfterDate', async: false })
class IsAfterDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [relatedPropertyName] = args.constraints as [string];
    const obj = args.object as Record<string, unknown>;
    const relatedValue = obj[relatedPropertyName];

    if (!value || !relatedValue) return true; // @IsISO8601 sẽ xử lý lỗi thiếu

    const current = new Date(value as string);
    const related = new Date(relatedValue as string);
    if (Number.isNaN(current.getTime()) || Number.isNaN(related.getTime())) return true;

    return current.getTime() > related.getTime();
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedPropertyName] = args.constraints as [string];
    return `${args.property} phải sau ${relatedPropertyName}`;
  }
}

export function IsAfterDate(property: string, validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsAfterDateConstraint,
    });
  };
}
