import * as factory from '@motionpicture/ttts-factory';
import * as AWS from 'aws-sdk';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

export type AttributeListType = AWS.CognitoIdentityServiceProvider.AttributeListType;
export type IPerson = factory.person.IProfile & factory.person.IPerson;

/**
 * 会員リポジトリ
 * 会員情報の保管先は基本的にAmazon Cognitoです。
 */
export class CognitoRepository {
    public readonly cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider;

    constructor(cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider) {
        this.cognitoIdentityServiceProvider = cognitoIdentityServiceProvider;
    }

    public static ATTRIBUTE2PROFILE(userAttributes: AttributeListType) {
        const profile: factory.person.IProfile = {
            last_name: '',
            first_name: '',
            tel: '',
            age: '',
            address: '',
            gender: '',
            givenName: '',
            familyName: '',
            email: '',
            telephone: '',
            additionalProperty: userAttributes.map((a) => {
                return { name: a.Name, value: a.Value };
            })
        };

        userAttributes.forEach((userAttribute) => {
            switch (userAttribute.Name) {
                case 'given_name':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    profile.givenName = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                case 'family_name':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    profile.familyName = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                case 'email':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    profile.email = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                case 'phone_number':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    profile.telephone = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
            }
        });

        return profile;
    }

    public static ATTRIBUTE2PERSON(params: {
        username?: string;
        attributes: AttributeListType;
    }) {
        const profile = CognitoRepository.ATTRIBUTE2PROFILE(params.attributes);
        const person: IPerson = {
            typeOf: factory.personType.Person,
            id: '',
            memberOf: {
                typeOf: 'ProgramMembership',
                membershipNumber: params.username,
                programName: 'Amazon Cognito',
                award: []
            },
            ...profile
        };
        params.attributes.forEach((a) => {
            switch (a.Name) {
                case 'sub':
                    // tslint:no-single-line-block-comment
                    person.id = (a.Value !== undefined) ? a.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
            }
        });

        return person;
    }

    public static PROFILE2ATTRIBUTE(params: factory.person.IProfile): AttributeListType {
        let formatedPhoneNumber: string;
        try {
            const phoneUtil = PhoneNumberUtil.getInstance();
            const phoneNumber = phoneUtil.parse(params.telephone);
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (!phoneUtil.isValidNumber(phoneNumber)) {
                throw new Error('Invalid phone number');
            }
            formatedPhoneNumber = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
        } catch (error) {
            throw new factory.errors.Argument('telephone', 'Invalid phone number');
        }

        const userAttributes: AttributeListType = [
            {
                Name: 'given_name',
                Value: params.givenName
            },
            {
                Name: 'family_name',
                Value: params.familyName
            },
            {
                Name: 'phone_number',
                Value: formatedPhoneNumber
            },
            {
                Name: 'email',
                Value: params.email
            }
        ];
        if (Array.isArray(params.additionalProperty)) {
            userAttributes.push(...params.additionalProperty.map((a) => {
                return {
                    Name: a.name,
                    Value: a.value
                };
            }));
        }

        return userAttributes;
    }

    /**
     * 管理者権限でユーザー属性を取得する
     */
    public async  getUserAttributes(params: {
        userPooId: string;
        username: string;
    }) {
        return new Promise<factory.person.IProfile>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.adminGetUser(
                {
                    UserPoolId: params.userPooId,
                    Username: params.username
                },
                (err, data) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore if: please write tests */
                        if (data.UserAttributes === undefined) {
                            reject(new factory.errors.NotFound('User'));
                        } else {
                            resolve(CognitoRepository.ATTRIBUTE2PROFILE(data.UserAttributes));
                        }
                    }
                });
        });
    }

    /**
     * 管理者権限でプロフィール更新
     */
    public async updateProfile(params: {
        userPooId: string;
        username: string;
        profile: factory.person.IProfile;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const userAttributes = CognitoRepository.PROFILE2ATTRIBUTE(params.profile);

            this.cognitoIdentityServiceProvider.adminUpdateUserAttributes(
                {
                    UserPoolId: params.userPooId,
                    Username: params.username,
                    UserAttributes: userAttributes
                },
                (err) => {
                    if (err instanceof Error) {
                        reject(new factory.errors.Argument('profile', err.message));
                    } else {
                        resolve();
                    }
                });
        });
    }

    /**
     * 管理者権限でsubでユーザーを検索する
     */
    public async findById(params: {
        userPooId: string;
        userId: string;
    }) {
        return new Promise<IPerson>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.listUsers(
                {
                    UserPoolId: params.userPooId,
                    Filter: `sub="${params.userId}"`
                },
                (err, data) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore if: please write tests */
                        if (data.Users === undefined) {
                            reject(new factory.errors.NotFound('User'));
                        } else {
                            const user = data.Users.shift();
                            if (user === undefined || user.Attributes === undefined) {
                                reject(new factory.errors.NotFound('User'));
                            } else {
                                resolve(CognitoRepository.ATTRIBUTE2PERSON({
                                    username: user.Username,
                                    attributes: user.Attributes
                                }));
                            }
                        }
                    }
                });
        });
    }

    /**
     * アクセストークンでユーザー属性を取得する
     */
    public async getUserAttributesByAccessToken(accessToken: string): Promise<factory.person.IProfile> {
        return new Promise<factory.person.IProfile>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.getUser(
                {
                    AccessToken: accessToken
                },
                (err, data) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        resolve(CognitoRepository.ATTRIBUTE2PROFILE(data.UserAttributes));
                    }
                });
        });
    }

    /**
     * 会員プロフィール更新
     */
    public async updateProfileByAccessToken(params: {
        accessToken: string;
        profile: factory.person.IProfile;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const userAttributes = CognitoRepository.PROFILE2ATTRIBUTE(params.profile);

            this.cognitoIdentityServiceProvider.updateUserAttributes(
                {
                    AccessToken: params.accessToken,
                    UserAttributes: userAttributes
                },
                (err) => {
                    if (err instanceof Error) {
                        reject(new factory.errors.Argument('profile', err.message));
                    } else {
                        resolve();
                    }
                });
        });
    }

    /**
     * 退会
     */
    public async unregister(params: {
        userPooId: string;
        username: string;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.adminDisableUser(
                {
                    UserPoolId: params.userPooId,
                    Username: params.username
                },
                (err) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * 検索
     */
    public async search(params: {
        userPooId: string;
        id?: string;
        username?: string;
        email?: string;
        telephone?: string;
        givenName?: string;
        familyName?: string;
    }) {
        return new Promise<IPerson[]>((resolve, reject) => {
            const request: AWS.CognitoIdentityServiceProvider.Types.ListUsersRequest = {
                // Limit: 60,
                UserPoolId: params.userPooId
            };

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.id !== undefined) {
                request.Filter = `sub^="${params.id}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.username !== undefined) {
                request.Filter = `username^="${params.username}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.email !== undefined) {
                request.Filter = `email^="${params.email}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.telephone !== undefined) {
                request.Filter = `phone_number^="${params.telephone}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.givenName !== undefined) {
                request.Filter = `given_name^="${params.givenName}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.familyName !== undefined) {
                request.Filter = `family_name^="${params.familyName}"`;
            }

            this.cognitoIdentityServiceProvider.listUsers(
                request,
                (err, data) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore if: please write tests */
                        if (data.Users === undefined) {
                            reject(new factory.errors.NotFound('User'));
                        } else {
                            resolve(data.Users.map((u) => CognitoRepository.ATTRIBUTE2PERSON({
                                username: u.Username,
                                attributes: <AttributeListType>u.Attributes
                            })));
                        }
                    }
                });
        });
    }
}
