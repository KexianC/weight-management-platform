import { YuanqizhanController, YuanqizhanService } from './yuanqizhan';
import { YuanqizhanRemindersService } from './yuanqizhan-reminders';
import { BodyCloudOcrController, BodyCloudOcrService } from './body-cloud-ocr';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { AuthController, AuthService } from './auth';
import { CareController, CareService, CareSummariesController, ClinicalController, ClinicalService } from './clinical';
import { CommunicationsController, CommunicationsService } from './communications';
import { FollowUpsController, FollowUpsService } from './followups';
import { HealthController } from './health';
import { MediaController, MediaService } from './media';
import { RecordsController, RecordsService } from './records';
import { RemindersController, RemindersService } from './reminders';
import { TasksController, TasksService } from './tasks';
import { SmsDeliveryService } from './sms-delivery';
import { AdminBootstrapService, AdminController, AdminService } from './admin';
import { DietPlanTemplateAdminController, NutritionController, NutritionService } from './nutrition';
import { CareManagementController, CareManagementService } from './care-management';
import { ReportWorkflowController, ReportWorkflowService } from './report-workflow';
import { NutritionPrivacyInterceptor } from './privacy';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: process.env.RECONSTRUCTION_LOCAL_ONLY === 'true' }), JwtModule.register({})],
  controllers: [YuanqizhanController, BodyCloudOcrController,
    HealthController,
    AuthController,
    ClinicalController,
    CareSummariesController,
    CareController,
    RecordsController,
    TasksController,
    FollowUpsController,
    CommunicationsController,
    MediaController,
    RemindersController,
    AdminController,
    NutritionController,
    DietPlanTemplateAdminController,
    CareManagementController,
    ReportWorkflowController,
  ],
  providers: [YuanqizhanService, YuanqizhanRemindersService, BodyCloudOcrService,
    PrismaService,
    SmsDeliveryService,
    AuthService,
    ClinicalService,
    CareService,
    RecordsService,
    TasksService,
    FollowUpsService,
    CommunicationsService,
    MediaService,
    RemindersService,
    AdminService,
    AdminBootstrapService,
    NutritionService,
    CareManagementService,
    ReportWorkflowService,
    { provide: APP_INTERCEPTOR, useClass: NutritionPrivacyInterceptor },
  ],
})
export class AppModule {}
